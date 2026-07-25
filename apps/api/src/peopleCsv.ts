export type PeopleCsvRow = {
  name?: string;
  email?: string;
  title?: string;
  levelKey?: string;
  hireDate?: string;
};

export function parsePeopleCsv(text: string): PeopleCsvRow[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]!).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
  const nameI = idx(["name", "full_name", "fullname"]);
  const emailI = idx(["email", "mail"]);
  const titleI = idx(["title", "job_title", "role_title"]);
  const levelI = idx(["levelkey", "level_key", "level"]);
  const hireI = idx(["hiredate", "hire_date", "start_date"]);
  if (nameI < 0) throw new Error("CSV must include a name column");
  const out: PeopleCsvRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    out.push({
      name: cols[nameI],
      email: emailI >= 0 ? cols[emailI] : undefined,
      title: titleI >= 0 ? cols[titleI] : undefined,
      levelKey: levelI >= 0 ? cols[levelI] : undefined,
      hireDate: hireI >= 0 ? cols[hireI] : undefined,
    });
  }
  return out;
}

export function splitCsvLine(line: string): string[] {
  const cols: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cols.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  cols.push(cur.trim());
  return cols;
}
