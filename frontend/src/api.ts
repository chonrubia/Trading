// Base del backend configurable para despliegues (Vercel, etc.).
// En local se usa "" (mismo origen vía proxy de Vite). En Vercel define
// VITE_API_URL=https://tu-backend-en-render-o-railway (sin barra final).
const RAW: string = (import.meta as any).env?.VITE_API_URL || "";
export const API_BASE: string = String(RAW).replace(/\/$/, "");
export const apiFetch = (p: string, init?: any) => fetch(API_BASE + p, init);
export const wsEndpoint = () =>
  API_BASE ? API_BASE.replace(/^http/, "ws") + "/ws/floor" : `ws://${location.hostname}:8765/ws/floor`;
