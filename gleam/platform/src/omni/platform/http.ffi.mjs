import { Ok, Error } from "../../gleam.mjs";

export async function fetch_text(url) {
  try {
    const response = await globalThis.fetch(String(url), { redirect: "follow" });
    if (!response.ok) return new Error(`HTTP ${response.status}`);
    return new Ok(await response.text());
  } catch (err) {
    return new Error(String(err && err.message ? err.message : err));
  }
}
