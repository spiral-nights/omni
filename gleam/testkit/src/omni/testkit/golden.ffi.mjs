import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function read_file(filepath, on_ok, on_err) {
  try {
    const content = fs.readFileSync(filepath, "utf8");
    return on_ok(content);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return on_err(msg);
  }
}

export function write_file(filepath, content, on_ok, on_err) {
  try {
    const dir = path.dirname(filepath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filepath, content, "utf8");
    return on_ok(undefined);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return on_err(msg);
  }
}

export function file_exists(filepath) {
  return fs.existsSync(filepath);
}

export function is_update_mode() {
  return (
    process.env.UPDATE_GOLDEN === "1" ||
    process.env.OMNI_UPDATE_GOLDEN === "1" ||
    process.env.UPDATE_SNAPSHOTS === "1"
  );
}

export function resolve_path(base_dir, filename) {
  if (path.isAbsolute(filename)) {
    return filename;
  }
  const dir = base_dir && base_dir.length > 0 ? base_dir : "test/golden";
  return path.resolve(process.cwd(), dir, filename);
}
