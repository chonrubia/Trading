// Resolución del backend sin configurar nada:
// 1) VITE_API_URL si está definida (ej. backend en Render)
// 2) mismo origen (proxy de Vite en local)
// 3) http://localhost:8765 y http://127.0.0.1:8765 (la página de Vercel puede
//    llamar a localhost: los navegadores lo eximen del bloqueo mixto https)
// Si nada responde -> null y la app arranca en modo demo con snapshot.
const ENV: string = ((import.meta as any).env?.VITE_API_URL || "").replace(/\/$/, "");
// Bypass de la protección Vercel (solo tu PC): si defines VITE_VERCEL_BYPASS,
// todas las llamadas llevan x-vercel-protection-bypass y la muralla deja pasar.
const BYPASS: string = (import.meta as any).env?.VITE_VERCEL_BYPASS || "";
let API_BASE: string = ENV;

function probe(base: string, ms: number): Promise<string | null> {
  return new Promise(resolve => {
    const ctl = new AbortController();
    const to = setTimeout(() => { ctl.abort(); resolve(null); }, ms);
    fetch((base || "") + "/api/health", { signal: ctl.signal })
      .then(r => {
        clearTimeout(to);
        if (!r.ok) return resolve(null);
        return r.json().then((j: any) => resolve(j && j.ok ? (base || "SAME") : null)).catch(() => resolve(null));
      })
      .catch(() => resolve(null));
  });
}

export async function resolveApiBase(): Promise<string | null> {
  if (API_BASE) return API_BASE;
  const [same, lh, ip] = await Promise.all([probe("", 2500), probe("http://localhost:8765", 2500), probe("http://127.0.0.1:8765", 2500)]);
  if (same) return "";
  if (lh) { API_BASE = lh; return API_BASE; }
  if (ip) { API_BASE = ip; return API_BASE; }
  return null;
}

export const apiFetch = (p: string, init?: any) => {
  const headers = { ...(init?.headers || {}), ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}) };
  return fetch(API_BASE + p, { ...init, headers });
};
export const wsEndpoint = () =>
  API_BASE ? API_BASE.replace(/^http/, "ws") + "/ws/floor" : `ws://${location.hostname}:8765/ws/floor`;
