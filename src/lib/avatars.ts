// Avatars are never uploaded or stored in Supabase Storage — we only ever
// persist the CDN URL (user_preferences.avatar_url). The full catalog is
// fetched live from the alohe/avatars GitHub repo via jsDelivr's public
// "flat file list" API, so this stays in sync with the repo without us
// having to hardcode or guess filenames.
const MANIFEST_URL = "https://data.jsdelivr.com/v1/package/gh/alohe/avatars@main/flat";
const CDN_BASE = "https://cdn.jsdelivr.net/gh/alohe/avatars@main";

export interface AvatarOption {
  id: string; // stable id, e.g. "vibrent_12" — safe to store if you ever want to reference the style
  style: string; // e.g. "vibrent"
  url: string; // full CDN URL, e.g. https://cdn.jsdelivr.net/gh/alohe/avatars@main/png/vibrent_12.png
}

interface JsDelivrFlatFile {
  name: string; // e.g. "/png/vibrent_12.png"
  size: number;
}

let cache: AvatarOption[] | null = null;
let inFlight: Promise<AvatarOption[]> | null = null;

function parseFileName(name: string): { style: string; id: string } | null {
  // name looks like "/png/vibrent_12.png" — keep only top-level png files,
  // skip folders/other formats so we don't offer broken links.
  const match = name.match(/^\/png\/([a-zA-Z0-9]+)_(\d+)\.png$/);
  if (!match) return null;
  const [, style, num] = match;
  return { style, id: `${style}_${num}` };
}

export async function fetchAvatarCatalog(): Promise<AvatarOption[]> {
  if (cache) return cache;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) throw new Error("Could not load the avatar catalog. Please try again.");
    const data = (await res.json()) as { files: JsDelivrFlatFile[] };

    const options: AvatarOption[] = [];
    for (const file of data.files ?? []) {
      const parsed = parseFileName(file.name);
      if (!parsed) continue;
      options.push({ id: parsed.id, style: parsed.style, url: `${CDN_BASE}${file.name}` });
    }
    options.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    cache = options;
    return options;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export function getAvatarStyles(catalog: AvatarOption[]): string[] {
  return Array.from(new Set(catalog.map((a) => a.style))).sort();
}

export function pickRandomAvatar(catalog: AvatarOption[]): AvatarOption | null {
  if (catalog.length === 0) return null;
  return catalog[Math.floor(Math.random() * catalog.length)];
}
