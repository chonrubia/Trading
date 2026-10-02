// Lectura del motor en la nube (rama engine-state) sin rebuilds:
// la API de GitHub permite CORS y siempre sirve el fichero fresco.
const OWNER = "chonrubia";
const REPO = "Trading";
const BRANCH = "engine-state";
const PATH = "live.json";

export async function fetchLive(timeoutMs = 9000): Promise<any | null> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}?ref=${BRANCH}`, { signal: ctl.signal });
    clearTimeout(to);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.content) return null;
    const txt = atob(j.content.replace(/\n/g, ""));
    return JSON.parse(decodeURIComponent(escape(txt)));
  } catch {
    clearTimeout(to);
    return null;
  }
}
export const liveAgeMin = (live: any) => {
  if (!live?.generated_at) return null;
  return Math.max(0, Math.round((Date.now() - Date.parse(live.generated_at)) / 60000));
};
