// Genera frontend/public/snapshot.json con datos REALES del motor:
// arranca el backend en un puerto aparte, lo deja operar N ticks y vuelca
// portfolio, mercado, ranking, agentes, chat, setups, desks, informe y memoria.
// Uso: node backend/scripts/make-snapshot.js [ticks]  (2s por tick)
// Env: PORT (def. 18765), SNAP_OUT (def. frontend/public/snapshot.json)
const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 18765;
const TICKS = Number(process.argv[2] || 150);
const OUT = process.env.SNAP_OUT || path.join(__dirname, "..", "..", "frontend", "public", "snapshot.json");

function get(p) {
  return new Promise((res, rej) => {
    http.get({ host: "127.0.0.1", port: PORT, path: p }, r => {
      let b = "";
      r.on("data", c => (b += c));
      r.on("end", () => { try { res(JSON.parse(b)); } catch (e) { rej(e); } });
    }).on("error", rej);
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = spawn("node", ["src/index.js"], { cwd: path.join(__dirname, ".."), env: { ...process.env, PORT: String(PORT) }, stdio: "ignore" });
  const kill = () => { try { process.kill(srv.pid); } catch {} };
  process.on("exit", kill); process.on("SIGINT", () => { kill(); process.exit(1); });
  for (let i = 0; i < 40; i++) { try { await get("/api/health"); break; } catch { await sleep(2000); } }
  console.log("motor en marcha, calentando " + TICKS + " ticks...");
  await sleep(TICKS * 2000);
  const [portfolio, market, ranking, agents, departments, messages, setups, desks, report, memory, school, meetings, audit, labStats] = await Promise.all([
    get("/api/portfolio"), get("/api/market"), get("/api/ranking"), get("/api/agents?limit=200"),
    get("/api/departments"), get("/api/channels/c-general/messages"), get("/api/setups"), get("/api/desks"),
    get("/api/report"), get("/api/memory?limit=15"), get("/api/school/leaderboard"), get("/api/meetings"),
    get("/api/audit?limit=20"), get("/api/incubator/stats"),
  ]);
  const lite = a => ({ id: a.id, name: a.name, role: a.role, department_id: a.department_id, strategy: a.strategy, pair: a.pair, timeframe: a.timeframe, leverage: a.leverage, status: a.status, mood: a.mood, level_risk: a.level_risk, level_ta: a.level_ta, studying: a.studying, pnl: a.pnl, win_rate: a.win_rate, profit_factor: a.profit_factor, drawdown: a.drawdown, trades_count: a.trades_count, last_reason: a.last_reason });
  const snap = {
    generated_at: new Date().toISOString(), ticks: TICKS, portfolio, market, ranking,
    agents: agents.map(lite), departments, messages, setups,
    desks: { pnl: desks.pnl, funding: desks.funding },
    report: { verdict: report.verdict, net: report.net, fees_paid: report.fees_paid, costs_drag: report.costs_drag, win_rate: report.win_rate, profit_factor: report.profit_factor, sharpe: report.sharpe, days: report.days, green_days: report.green_days, trades: report.trades, desk_net: report.desk_net },
    memory, school, meetings, audit: audit.slice(0, 20), labStats,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(snap));
  console.log("snapshot OK: " + agents.length + " agentes, " + messages.length + " mensajes -> " + OUT);
  kill(); process.exit(0);
})().catch(e => { console.error("FALLO snapshot:", e.message || e); try { process.exit(1); } catch {} });
