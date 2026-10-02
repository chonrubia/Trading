// Cliente API mismo-origen (la app Next sirve /api/*). Sin proxy ni WS.
export const apiFetch = (p: string, init?: any) => fetch(p, init);
