export interface AppHandler {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  isInstalled: boolean;
  schemes: string[];
  kinds?: number[];
  naddr?: string;
}

export function detectUriScheme(uri: string): { scheme: string; target?: string; kind?: number } {
  const trimmed = uri.trim();
  const colonIdx = trimmed.indexOf(":");
  if (colonIdx === -1) {
    return { scheme: "unknown", target: trimmed };
  }

  const scheme = trimmed.slice(0, colonIdx).toLowerCase();
  const target = trimmed.slice(colonIdx + 1);

  let kind: number | undefined;
  if (scheme === "nostr") {
    if (target.startsWith("note1") || target.startsWith("nevent1")) {
      kind = 1;
    } else if (target.startsWith("npub1") || target.startsWith("nprofile1")) {
      kind = 0;
    } else if (target.startsWith("naddr1")) {
      kind = 30023;
    }
  }

  return { scheme, target, kind };
}
