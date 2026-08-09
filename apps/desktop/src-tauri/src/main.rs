#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
  fs,
  io::{Read, Write},
  net::TcpStream,
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::Mutex,
  thread,
  time::{Duration, Instant},
};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_API_HOST: &str = "127.0.0.1";
const DEFAULT_API_PORT: u16 = 8787;
const DEFAULT_API_BASE: &str = "http://127.0.0.1:8787";
const DEV_UI_URL: &str = "http://localhost:5173";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct LaunchConfig {
  api_base_url: String,
  launch_token: String,
}

struct LaunchState(Mutex<LaunchConfig>);
struct ApiChild(Mutex<Option<Child>>);

#[tauri::command]
fn get_launch_config(state: State<'_, LaunchState>) -> Result<LaunchConfig, String> {
  state
    .0
    .lock()
    .map(|g| g.clone())
    .map_err(|_| "launch config lock poisoned".into())
}

#[tauri::command]
fn get_app_version() -> String {
  env!("CARGO_PKG_VERSION").into()
}

fn api_port() -> u16 {
  std::env::var("PRM_PORT")
    .ok()
    .and_then(|s| s.parse().ok())
    .unwrap_or(DEFAULT_API_PORT)
}

fn api_base_url() -> String {
  std::env::var("PRM_API_BASE_URL").unwrap_or_else(|_| {
    format!("http://{DEFAULT_API_HOST}:{}", api_port())
  })
}

fn resolve_data_dir(app: &AppHandle) -> PathBuf {
  if let Ok(dir) = std::env::var("PRM_DATA_DIR") {
    return PathBuf::from(dir);
  }
  // Dev: keep repo `data/` next to the monorepo for shared browser/desktop use.
  if cfg!(debug_assertions) {
    return PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../data");
  }
  // Packaged: never use CARGO_MANIFEST_DIR (that is a CI/build-machine path).
  match app.path().app_data_dir() {
    Ok(dir) => dir,
    Err(_) => std::env::temp_dir().join("prm-workbench-data"),
  }
}

fn read_launch_token(path: &Path) -> Option<String> {
  fs::read_to_string(path)
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
}

fn write_launch_token(path: &Path, token: &str) -> std::io::Result<()> {
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent)?;
  }
  #[cfg(unix)]
  {
    use std::os::unix::fs::OpenOptionsExt;
    let mut f = fs::OpenOptions::new()
      .write(true)
      .create(true)
      .truncate(true)
      .mode(0o600)
      .open(path)?;
    f.write_all(token.as_bytes())?;
    return Ok(());
  }
  #[cfg(not(unix))]
  {
    fs::write(path, token)
  }
}

fn random_token() -> String {
  let mut buf = [0u8; 32];
  if let Ok(mut f) = fs::File::open("/dev/urandom") {
    let _ = f.read_exact(&mut buf);
  } else {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
      .duration_since(UNIX_EPOCH)
      .map(|d| d.as_nanos())
      .unwrap_or(0);
    for (i, b) in buf.iter_mut().enumerate() {
      *b = ((nanos >> ((i % 16) * 8)) as u8).wrapping_add(i as u8);
    }
  }
  buf.iter().map(|b| format!("{b:02x}")).collect()
}

fn resolve_launch_config(data: &Path) -> LaunchConfig {
  let token_path = data.join(".launch_token");
  let from_env = std::env::var("PRM_LAUNCH_TOKEN")
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let token = from_env
    .or_else(|| read_launch_token(&token_path))
    .unwrap_or_else(random_token);
  let _ = write_launch_token(&token_path, &token);
  LaunchConfig {
    api_base_url: api_base_url(),
    launch_token: token,
  }
}

fn exe_dir() -> Option<PathBuf> {
  std::env::current_exe()
    .ok()
    .and_then(|p| p.parent().map(|d| d.to_path_buf()))
}

fn candidate_sidecar_dirs(resource_dir: Option<&Path>) -> Vec<PathBuf> {
  let mut dirs = Vec::new();
  if let Ok(custom) = std::env::var("PRM_API_SIDECAR_DIR") {
    dirs.push(PathBuf::from(custom));
  }
  if let Some(res) = resource_dir {
    dirs.push(res.join("sidecars"));
    dirs.push(res.to_path_buf());
  }
  if let Some(exe) = exe_dir() {
    dirs.push(exe.join("sidecars"));
    dirs.push(exe.join("resources").join("sidecars"));
    dirs.push(exe.clone());
    dirs.push(exe.join("resources"));
  }
  dirs.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("sidecars"));
  dirs
}

fn resolve_ui_dir(resource_dir: Option<&Path>) -> Option<PathBuf> {
  if let Ok(dir) = std::env::var("PRM_UI_DIR") {
    let p = PathBuf::from(dir);
    if p.join("index.html").exists() {
      return Some(p);
    }
  }
  let mut dirs = Vec::new();
  if let Some(res) = resource_dir {
    dirs.push(res.join("ui-dist"));
    dirs.push(res.to_path_buf());
  }
  if let Some(exe) = exe_dir() {
    dirs.push(exe.join("ui-dist"));
    dirs.push(exe.join("resources").join("ui-dist"));
  }
  dirs.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("ui-dist"));
  dirs
    .into_iter()
    .find(|d| d.join("index.html").exists())
}

fn append_log(path: &Path, line: &str) {
  if let Ok(mut f) = fs::OpenOptions::new().create(true).append(true).open(path) {
    let _ = writeln!(f, "{line}");
  }
}

/// Strip Windows `\\?\` / `\\?\UNC\` prefixes so Node can resolve the main script.
///
/// Tauri `resource_dir()` often returns verbatim paths. Node's module loader then
/// mis-parses them and dies with `EISDIR: illegal operation on a directory, lstat 'C:'`.
fn strip_windows_verbatim(path: &Path) -> PathBuf {
  let s = path.to_string_lossy();
  if let Some(rest) = s.strip_prefix(r"\\?\") {
    if let Some(unc) = rest.strip_prefix(r"UNC\") {
      return PathBuf::from(format!(r"\\{unc}"));
    }
    return PathBuf::from(rest);
  }
  path.to_path_buf()
}

/// Spawn the local Node API when a bundled sidecar exists or `PRM_SPAWN_API=1`.
fn maybe_spawn_api(
  token: &str,
  data: &Path,
  resource_dir: Option<&Path>,
  ui_dir: Option<&Path>,
  log_path: &Path,
) -> Option<Child> {
  let force = std::env::var("PRM_SPAWN_API").ok().as_deref() == Some("1");
  let api_entry = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../api/src/index.ts");
  let port = api_port();

  let mut program: Option<PathBuf> = None;
  let mut args: Vec<PathBuf> = Vec::new();
  let mut cwd: Option<PathBuf> = None;

  for dir in candidate_sidecar_dirs(resource_dir) {
    let script = dir.join("prm-api.mjs");
    append_log(
      log_path,
      &format!(
        "PRM: probe sidecar dir {} script_exists={} node_exists={}",
        dir.display(),
        script.exists(),
        if cfg!(windows) {
          dir.join("node.exe").exists()
        } else {
          dir.join("node").exists()
        }
      ),
    );
    if !script.exists() {
      continue;
    }
    let bundled_node = if cfg!(windows) {
      dir.join("node.exe")
    } else {
      dir.join("node")
    };
    // Prefer relative entry + cwd so Node never sees a verbatim absolute script path.
    let safe_cwd = strip_windows_verbatim(&dir);
    if bundled_node.exists() {
      let node_name = if cfg!(windows) { "node.exe" } else { "node" };
      program = Some(safe_cwd.join(node_name));
    } else {
      program = Some(PathBuf::from("node"));
    }
    args = vec![PathBuf::from("prm-api.mjs")];
    cwd = Some(safe_cwd);
    break;
  }

  if program.is_none() && force && api_entry.exists() {
    program = Some(PathBuf::from("pnpm"));
    args = vec![
      PathBuf::from("exec"),
      PathBuf::from("tsx"),
      PathBuf::from("src/index.ts"),
    ];
    cwd = api_entry.parent()?.parent().map(|p| p.to_path_buf());
  }

  let (program, args, cwd) = match (program, cwd) {
    (Some(p), Some(c)) => (p, args, c),
    _ => {
      append_log(log_path, "PRM: no API sidecar found (prm-api.mjs missing)");
      return None;
    }
  };

  let data = strip_windows_verbatim(data);
  let ui_dir = ui_dir.map(strip_windows_verbatim);
  let _ = fs::create_dir_all(&data);
  append_log(
    log_path,
    &format!(
      "PRM: spawning API sidecar program={} cwd={} data={} port={port} ui={}",
      program.display(),
      cwd.display(),
      data.display(),
      ui_dir
        .as_ref()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "(none)".into())
    ),
  );

  // Append child stdio to the same log (avoids pipe-buffer deadlocks on Windows).
  let child_log = match fs::OpenOptions::new().create(true).append(true).open(log_path) {
    Ok(f) => f,
    Err(err) => {
      append_log(log_path, &format!("PRM: could not open log for child stdio: {err}"));
      return None;
    }
  };
  let child_err = match child_log.try_clone() {
    Ok(f) => f,
    Err(err) => {
      append_log(log_path, &format!("PRM: could not clone log for stderr: {err}"));
      return None;
    }
  };

  let mut command = Command::new(&program);
  command
    .args(&args)
    .current_dir(&cwd)
    .env("PRM_LAUNCH_TOKEN", token)
    .env("PRM_DATA_DIR", &data)
    .env("PRM_PORT", port.to_string())
    .stdin(Stdio::null())
    .stdout(Stdio::from(child_log))
    .stderr(Stdio::from(child_err));
  if let Some(ref ui) = ui_dir {
    command.env("PRM_UI_DIR", ui);
  }
  // GUI subsystem apps on Windows must not attach a console to Node or spawn can hang/fail.
  #[cfg(windows)]
  {
    command.creation_flags(CREATE_NO_WINDOW);
  }

  match command.spawn() {
    Ok(mut child) => {
      // Detect immediate crash (missing native module, bad path, etc.)
      thread::sleep(Duration::from_millis(200));
      match child.try_wait() {
        Ok(Some(status)) => {
          append_log(
            log_path,
            &format!("PRM: API sidecar exited immediately with {status}"),
          );
          return None;
        }
        Ok(None) => {}
        Err(err) => {
          append_log(log_path, &format!("PRM: try_wait failed: {err}"));
        }
      }
      append_log(
        log_path,
        &format!("PRM: spawned API sidecar ({})", program.display()),
      );
      Some(child)
    }
    Err(err) => {
      append_log(log_path, &format!("PRM: failed to spawn API sidecar: {err}"));
      None
    }
  }
}

fn api_health_ok(port: u16) -> bool {
  let addr = format!("{DEFAULT_API_HOST}:{port}");
  let Ok(mut stream) = TcpStream::connect_timeout(
    &addr.parse().expect("api addr"),
    Duration::from_millis(400),
  ) else {
    return false;
  };
  let _ = stream.set_read_timeout(Some(Duration::from_millis(800)));
  let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
  let req = format!(
    "GET /api/health HTTP/1.1\r\nHost: {DEFAULT_API_HOST}:{port}\r\nConnection: close\r\n\r\n"
  );
  if stream.write_all(req.as_bytes()).is_err() {
    return false;
  }
  let mut buf = Vec::new();
  let _ = stream.read_to_end(&mut buf);
  let body = String::from_utf8_lossy(&buf);
  body.contains("200") && body.contains("ok")
}

fn wait_for_api(port: u16, timeout: Duration, log_path: &Path) -> bool {
  let start = Instant::now();
  while start.elapsed() < timeout {
    if api_health_ok(port) {
      append_log(
        log_path,
        &format!("PRM: API healthy on :{port} after {:?}", start.elapsed()),
      );
      return true;
    }
    thread::sleep(Duration::from_millis(200));
  }
  append_log(
    log_path,
    &format!("PRM: API did not become healthy on :{port} within {timeout:?}"),
  );
  false
}

fn main() {
  tauri::Builder::default()
    .manage(LaunchState(Mutex::new(LaunchConfig {
      api_base_url: DEFAULT_API_BASE.into(),
      launch_token: String::new(),
    })))
    .manage(ApiChild(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![get_launch_config, get_app_version])
    .setup(move |app| {
      let data = resolve_data_dir(app.handle());
      let _ = fs::create_dir_all(&data);
      let log_path = data.join("desktop-api.log");
      let launch = resolve_launch_config(&data);
      std::env::set_var("PRM_LAUNCH_TOKEN", &launch.launch_token);
      std::env::set_var("PRM_DATA_DIR", &data);

      if let Ok(mut guard) = app.state::<LaunchState>().0.lock() {
        *guard = launch.clone();
      }

      let resource_dir = app.path().resource_dir().ok();
      let ui_dir = resolve_ui_dir(resource_dir.as_deref());
      if let Some(ref ui) = ui_dir {
        append_log(&log_path, &format!("PRM: UI dir {}", ui.display()));
      } else {
        append_log(&log_path, "PRM: UI dir not found (will use bundled webview assets)");
      }

      let child = maybe_spawn_api(
        &launch.launch_token,
        &data,
        resource_dir.as_deref(),
        ui_dir.as_deref(),
        &log_path,
      );
      if let Ok(mut guard) = app.state::<ApiChild>().0.lock() {
        *guard = child;
      }

      let port = api_port();
      let ready = wait_for_api(port, Duration::from_secs(25), &log_path);
      if !ready {
        eprintln!(
          "PRM: API sidecar not healthy yet — see {}",
          log_path.display()
        );
      }

      let inject = format!(
        "window.__PRM_LAUNCH_TOKEN__={};window.__PRM_API_BASE_URL__={};window.__PRM_DESKTOP_LOG__={};window.__PRM_DESKTOP__=true;",
        serde_json::to_string(&launch.launch_token).unwrap_or_else(|_| "\"\"".into()),
        // Same-origin when loading the API-served UI: leave base empty so /api is relative.
        // Offline bundled webview still needs an absolute base to reach the sidecar.
        serde_json::to_string(if ready && ui_dir.is_some() {
          ""
        } else {
          launch.api_base_url.as_str()
        })
        .unwrap_or_else(|_| serde_json::to_string(DEFAULT_API_BASE).unwrap_or_else(|_| "\"\"".into())),
        serde_json::to_string(&log_path.to_string_lossy()).unwrap_or_else(|_| "\"\"".into()),
      );

      let url = if cfg!(debug_assertions) {
        WebviewUrl::External(DEV_UI_URL.parse().expect("dev ui url"))
      } else if ready && ui_dir.is_some() {
        // Same-origin with the API — avoids WebView2 CORS / mixed-content / Failed to fetch.
        let page = format!("{}/", launch.api_base_url.trim_end_matches('/'));
        append_log(&log_path, &format!("PRM: opening same-origin UI at {page}"));
        WebviewUrl::External(page.parse().expect("api ui url"))
      } else {
        append_log(&log_path, "PRM: opening bundled offline UI assets");
        WebviewUrl::App("index.html".into())
      };
      if app.get_webview_window("main").is_none() {
        // Keep http://tauri.localhost on Windows so fetch to http://127.0.0.1:8787 is not mixed-content blocked.
        WebviewWindowBuilder::new(app, "main", url)
          .title("Performance Review Manager")
          .inner_size(1280.0, 840.0)
          .resizable(true)
          .initialization_script(&inject)
          .use_https_scheme(false)
          .build()?;
      } else if let Some(window) = app.get_webview_window("main") {
        let _ = window.eval(&inject);
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building Performance Review Manager")
    .run(|app_handle, event| {
      if let tauri::RunEvent::Exit = event {
        if let Some(state) = app_handle.try_state::<ApiChild>() {
          if let Ok(mut guard) = state.0.lock() {
            if let Some(mut child) = guard.take() {
              let _ = child.kill();
              let _ = child.wait();
            }
          }
        }
      }
    });
}

#[cfg(test)]
mod tests {
  use super::strip_windows_verbatim;
  use std::path::{Path, PathBuf};

  #[test]
  fn strips_extended_length_prefix() {
    let p = Path::new(r"\\?\C:\Program Files\Performance Review Manager\sidecars");
    assert_eq!(
      strip_windows_verbatim(p),
      PathBuf::from(r"C:\Program Files\Performance Review Manager\sidecars")
    );
  }

  #[test]
  fn strips_unc_verbatim_prefix() {
    let p = Path::new(r"\\?\UNC\server\share\sidecars");
    assert_eq!(
      strip_windows_verbatim(p),
      PathBuf::from(r"\\server\share\sidecars")
    );
  }

  #[test]
  fn leaves_normal_paths_alone() {
    let p = Path::new(r"C:\Program Files\sidecars");
    assert_eq!(strip_windows_verbatim(p), p);
  }
}
