// Escuela: XP por materia y niveles. Port puro de backend/src/school.js.
// El mapa xp entra y sale (KV); sin I/O aquí.
export const SUBJECTS = ["riesgo", "tecnico", "macro", "derivados", "psicologia"];
export type XpMap = Record<string, Record<string, number>>;

export function level(total: number): number {
  return 1 + Math.floor(total / 100);
}

export function xpForClose(pnl: number): Array<{ s: string; x: number }> {
  if (pnl > 0) return [{ s: "tecnico", x: 8 + Math.min(12, Math.round(pnl)) }, { s: "riesgo", x: 4 }];
  return [{ s: "riesgo", x: 10 }, { s: "psicologia", x: 6 }];
}

// Aplica XP y devuelve la entrada de learning (el caller la persiste).
export function award(xp: XpMap, agentId: string, subject: string, amount: number, note: string, ts: string) {
  const s = SUBJECTS.includes(subject) ? subject : "tecnico";
  xp[agentId] = xp[agentId] || {};
  xp[agentId][s] = (xp[agentId][s] || 0) + amount;
  return { agent_id: agentId, subject: s, xp: amount, total: xp[agentId][s], level: level(xp[agentId][s]), note, ts };
}

export function leaderboard(agents: Array<{ id: string; name: string; role: string }>, xp: XpMap, limit = 12) {
  return agents.map(a => {
    const t = Object.values(xp[a.id] || {}).reduce((s: number, v) => s + Number(v), 0);
    return { id: a.id, name: a.name, role: a.role, xp: t, level: level(t) };
  }).sort((p, q) => q.xp - p.xp).slice(0, limit);
}
