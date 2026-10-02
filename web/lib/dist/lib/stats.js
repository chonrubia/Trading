"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupStats = setupStats;
exports.schoolLevel = schoolLevel;
exports.leaderboard = leaderboard;
// Agregados de lectura (puros). Port de la lógica de lectura de backend/src/index.js.
function setupStats(closed) {
    const m = {};
    closed.forEach(o => {
        const k = o.strategy || o.agent_name || "desconocido";
        m[k] = m[k] || { strategy: k, trades: 0, net: 0, wins: 0, rSum: 0 };
        m[k].trades++;
        m[k].net += o.pnl || 0;
        if (o.pnl > 0)
            m[k].wins++;
        const notion = (o.size || 0) * (o.entry || 0);
        m[k].rSum += (o.pnl || 0) / Math.max(0.01, notion * 0.0035 * (o.leverage || 1));
    });
    return Object.values(m).map((s) => ({
        strategy: s.strategy, trades: s.trades,
        net: Math.round(s.net * 100) / 100,
        avg: Math.round((s.net / s.trades) * 100) / 100,
        avgR: Math.round((s.rSum / s.trades) * 100) / 100,
        win: Math.round((s.wins / s.trades) * 1000) / 10,
    })).sort((a, b) => b.avgR - a.avgR);
}
function schoolLevel(totalXp) {
    return 1 + Math.floor(totalXp / 100);
}
function leaderboard(agents, xp, limit = 12) {
    return agents.map(a => {
        const t = Object.values(xp[a.id] || {}).reduce((s, v) => s + Number(v), 0);
        return { id: a.id, name: a.name, role: a.role, xp: t, level: schoolLevel(t) };
    }).sort((p, q) => q.xp - p.xp).slice(0, limit);
}
