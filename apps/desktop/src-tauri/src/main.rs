#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
  fs,
  io::Read,
  path::{Path, PathBuf},
  process::{Child, Command, Stdio},
  sync::Mutex,
};

use serde::Serialize;
use tauri::{Manager, State, WebviewUrl, WebviewWindowBuilder};

const DEFAULT_API_BASE: &str = "http://127.0.0.1:8787";
const DEV_UI_URL: &str = "http://localhost:5173";

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

fn data_dir() -> PathBuf {
  if let Ok(dir) = std::env::var("PRM_DATA_DIR") {
    return PathBuf::from(dir);
  }
  PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../data")
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
  fs::write(path, token)
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

fn resolve_launch_config() -> LaunchConfig {
  let token_path = data_dir().join(".launch_token");
  let from_env = std::env::var("PRM_LAUNCH_TOKEN")
    .ok()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty());
  let token = from_env
    .or_else(|| read_launch_token(&token_path))
    .unwrap_or_else(random_token);
  let _ = write_launch_token(&token_path, &token);
  LaunchConfig {
    api_base_url: std::env::var("PRM_API_BASE_URL").unwrap_or_else(|_| DEFAULT_API_BASE.into()),
    launch_token: token,
  }
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
  dirs.push(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("sidecars"));
  dirs
}

/// Spawn the local Node API when a bundled sidecar exists or `PRM_SPAWN_API=1`.
fn maybe_spawn_api(token: &str, resource_dir: Option<&Path>) -> Option<Child> {
  let force = std::env::var("PRM_SPAWN_API").ok().as_deref() == Some("1");
  let api_entry = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../api/src/index.ts");

  let mut program: Option<String> = None;
  let mut args: Vec<String> = Vec::new();
  let mut cwd: Option<PathBuf> = None;

  for dir in candidate_sidecar_dirs(resource_dir) {
    let script = dir.join("prm-api.mjs");
    if !script.exists() {
      continue;
    }
    let bundled_node = if cfg!(windows) {
      dir.join("node.exe")
    } else {
      dir.join("node")
    };
    if bundled_node.exists() {
      program = Some(bundled_node.to_string_lossy().to_string());
    } else {
      program = Some("node".into());
    }
    args = vec![script.to_string_lossy().to_string()];
    cwd = Some(dir);
    break;
  }

  if program.is_none() && force && api_entry.exists() {
    program = Some("pnpm".into());
    args = vec!["exec".into(), "tsx".into(), "src/index.ts".into()];
    cwd = api_entry.parent()?.parent().map(|p| p.to_path_buf());
  }

  let (program, args, cwd) = match (program, cwd) {
    (Some(p), Some(c)) => (p, args, c),
    _ => return None,
  };

  let data = data_dir();
  let _ = fs::create_dir_all(&data);
  match Command::new(&program)
    .args(&args)
    .current_dir(&cwd)
    .env("PRM_LAUNCH_TOKEN", token)
    .env("PRM_DATA_DIR", &data)
    .env("PRM_PORT", "8787")
    .stdin(Stdio::null())
    .stdout(Stdio::null())
    .stderr(Stdio::null())
    .spawn()
  {
    Ok(child) => {
      eprintln!("PRM: spawned API sidecar ({program})");
      Some(child)
    }
    Err(err) => {
      eprintln!("PRM: failed to spawn API sidecar: {err}");
      None
    }
  }
}

fn main() {
  let launch = resolve_launch_config();
  std::env::set_var("PRM_LAUNCH_TOKEN", &launch.launch_token);
  let token_for_spawn = launch.launch_token.clone();

  let inject = format!(
    "window.__PRM_LAUNCH_TOKEN__={};",
    serde_json::to_string(&launch.launch_token).unwrap_or_else(|_| "\"\"".into())
  );

  tauri::Builder::default()
    .manage(LaunchState(Mutex::new(launch)))
    .manage(ApiChild(Mutex::new(None)))
    .invoke_handler(tauri::generate_handler![get_launch_config])
    .setup(move |app| {
      let resource_dir = app.path().resource_dir().ok();
      let child = maybe_spawn_api(&token_for_spawn, resource_dir.as_deref());
      if let Some(state) = app.try_state::<ApiChild>() {
        if let Ok(mut guard) = state.0.lock() {
          *guard = child;
        }
      }

      let url = if cfg!(debug_assertions) {
        WebviewUrl::External(DEV_UI_URL.parse().expect("dev ui url"))
      } else {
        WebviewUrl::App("index.html".into())
      };
      if app.get_webview_window("main").is_none() {
        WebviewWindowBuilder::new(app, "main", url)
          .title("Performance Review Manager")
          .inner_size(1280.0, 840.0)
          .resizable(true)
          .initialization_script(&inject)
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
