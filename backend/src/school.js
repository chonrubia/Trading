// Escuela: XP por materia, niveles, mentoring. Ciclo: opera -> aprende -> sube nivel.
// xp: {agentId: {riesgo: n, tecnico: n, ...}}, learnings: [{agent_id, subject, xp, note, ts}]
const store = require("./store");
const SUBJECTS = ["riesgo", "tecnico", "macro", "derivados", "psicologia"];
let xp = store.load("school_xp", {});
let learnings = store.load("school_learnings", []);
function level(total) { return 1 + Math.floor(total / 100); }
function award(agentId, subject, amount, note) {
  if (!SUBJECTS.includes(subject)) subject = "tecnico";
  xp[agentId] = xp[agentId] || {};
  xp[agentId][subject] = (xp[agentId][subject] || 0) + amount;
  const entry = { agent_id: agentId, subject, xp: amount, total: xp[agentId][subject], level: level(xp[agentId][subject]), note, ts: new Date().toISOString() };
  learnings.unshift(entry);
  if (learnings.length > 300) learnings.length = 300;
  store.save("school_xp", xp); store.save("school_learnings", learnings);
  return entry;
}
// XP por cierre de operación: gana si TP, aprende riesgo si SL
function xpForClose(op) {
  if (op.pnl > 0) return [{ s: "tecnico", x: 8 + Math.min(12, Math.round(op.pnl)) }, { s: "riesgo", x: 4 }];
  return [{ s: "riesgo", x: 10 }, { s: "psicologia", x: 6 }];
}
function leaderboard(agents, limit = 10) {
  return agents.map(a => {
    const t = Object.values(xp[a.id] || {}).reduce((s, v) => s + v, 0);
    return { id: a.id, name: a.name, role: a.role, xp: t, level: level(t) };
  }).sort((p, q) => q.xp - p.xp).slice(0, limit);
}
function forAgent(agentId, limit = 10) { return learnings.filter(l => l.agent_id === agentId).slice(0, limit); }
module.exports = { SUBJECTS, award, xpForClose, leaderboard, forAgent, level, getAll: () => ({ xp, learnings: learnings.slice(0, 50) }) };
