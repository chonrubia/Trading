// Seed determinista: 13 departamentos + ~176 agentes (156 traders mesa + staff).
// Sin dependencias nativas: todo en memoria, misma schema que el README para migrar a Postgres.

const DEPARTMENTS = [
  { slug: "direccion", name: "Dirección", x: 0.78, y: 0.12, description: "CIO asigna capital y preside comité" },
  { slug: "riesgos", name: "Riesgos", x: 0.12, y: 0.18, description: "Bloquea operaciones inseguras, límites y kill-switch" },
  { slug: "macro", name: "Macroeconomía", x: 0.28, y: 0.18, description: "Contexto macro risk-on/off" },
  { slug: "analisis", name: "Análisis", x: 0.45, y: 0.22, description: "Técnico, on-chain, sentimiento, flujos" },
  { slug: "cartera", name: "Gestión Cartera", x: 0.62, y: 0.18, description: "Asignación y rebalanceo" },
  { slug: "trading", name: "Sala de Trading", x: 0.45, y: 0.55, description: "156 traders operando" },
  { slug: "derivados", name: "Derivados", x: 0.82, y: 0.42, description: "Futuros, opciones y coberturas" },
  { slug: "arbitraje", name: "Arbitraje", x: 0.12, y: 0.45, description: "Arbitraje exchanges y pares" },
  { slug: "quant", name: "Cuantitativo + ML", x: 0.82, y: 0.62, description: "Modelos, features, backtests" },
  { slug: "lab", name: "Laboratorio", x: 0.62, y: 0.78, description: "Mejora estrategias existentes" },
  { slug: "escuela", name: "Escuela", x: 0.28, y: 0.78, description: "Formación continua" },
  { slug: "bienestar", name: "Bienestar", x: 0.12, y: 0.68, description: "Evita tilt y sesgos" },
  { slug: "infra", name: "Infraestructura", x: 0.82, y: 0.82, description: "Latencia, conexiones, salud" },
];

const FIRST = ["Noa","Alba","Marcos","Amara","Ainhoa","Pablo","Amara","Martina","Aitana","Claudia","Mara","Lucía","Cándido","Álex","Elena","Mateo","Vera","Rubén","Hugo","Sara","Iker","Laia","Nil","Júlia","Oriol","Carla","Dani","Nora","Izan","Leire"];
const LAST = ["Singh","Serrano","García","Ortega","Vega","Molina","Herrera","Navarro","Torres","Cano","Rubio","López","Ruiz","Serrano","López","Miller","Chan","Torres","Duarte","Vidal","Costa","Ferrer","Soler","Puig","Vila","Roca","Martí","Serra","Bosch","Puig"];
const STRATEGIES = [
  { name: "Setup_9376 · Tendencia BTC", pair: "BTC", tf: "1h", style: "tendencia" },
  { name: "Setup_9373 · Breakout SOL", pair: "SOL", tf: "15m", style: "breakout" },
  { name: "Setup_9381 · MeanRev ETH", pair: "ETH", tf: "1h", style: "mean reversion" },
  { name: "Setup_9301 · Scalp ADA", pair: "ADA", tf: "5m", style: "scalping" },
  { name: "Setup_9292 · Swing AVAX", pair: "AVAX", tf: "4h", style: "swing" },
  { name: "Setup_9250 · SMA 7-25 LONG", pair: "BTC", tf: "1D", style: "tendencia" },
  { name: "Setup_9201 · RSI LINK", pair: "LINK", tf: "1h", style: "mean reversion" },
  { name: "Setup_9104 · Funding ARB", pair: "ETH", tf: "15m", style: "arbitraje" },
  { name: "Setup_9007 · EMA DOGE", pair: "DOGE", tf: "1h", style: "tendencia" },
  { name: "Setup_8902 · Donchian XRP", pair: "XRP", tf: "4h", style: "breakout" },
];
const PAIRS = ["BTC","ETH","SOL","XRP","BNB","DOGE","ADA","AVAX","LINK","NEAR","TRX","LTC"];
const STATUS = ["analizando","hablando","operando","estudiando","descansando"];
const MOODS = ["enfocado","neutral","confiado","cauto","en racha"];

function mulberry(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildState() {
  const rnd = mulberry(42);
  const departments = DEPARTMENTS.map((d, i) => ({ id: `d-${d.slug}`, ...d }));
  const bySlug = Object.fromEntries(departments.map(d => [d.slug, d]));
  const agents = [];
  let n = 0;
  const mk = (dept, name, role, extra = {}) => {
    n++;
    const s = STRATEGIES[Math.floor(rnd() * STRATEGIES.length)];
    agents.push({
      id: `a-${String(n).padStart(3, "0")}`,
      name, role, department_id: dept,
      avatar_seed: Math.floor(rnd() * 9999),
      strategy: s.name, pair: extra.pair || s.pair, timeframe: s.tf, style: s.style,
      risk_level: extra.risk_level || (1 + Math.floor(rnd() * 5)),
      leverage: extra.leverage || (1 + Math.floor(rnd() * 5)),
      capital_assigned: extra.capital || Math.round(200 + rnd() * 1800),
      status: STATUS[Math.floor(rnd() * STATUS.length)],
      mood: MOODS[Math.floor(rnd() * MOODS.length)],
      level_risk: 1 + Math.floor(rnd() * 5),
      level_ta: 1 + Math.floor(rnd() * 5),
      studying: ["Gestión de riesgo","Análisis técnico","Macro","Derivados","Psicología"][Math.floor(rnd() * 5)],
      pnl: Math.round((rnd() - 0.45) * 400 * 100) / 100,
      win_rate: Math.round((45 + rnd() * 20) * 10) / 10,
      profit_factor: Math.round((0.9 + rnd() * 1.1) * 100) / 100,
      drawdown: Math.round(rnd() * 8 * 100) / 100,
      trades_count: Math.floor(rnd() * 60),
      x: 0, y: 0,
      last_reason: "Esperando señal. Sin posición.",
    });
  };

  mk(bySlug.direccion.id, "Dirección CIO · Vega", "CIO / Directora", { capital: 0, risk_level: 1, leverage: 1 });
  mk(bySlug.riesgos.id, "Riesgo · Sato", "Risk Manager", { capital: 0 });
  mk(bySlug.riesgos.id, "Riesgo · Lina", "Risk Analyst", { capital: 0 });
  mk(bySlug.macro.id, "Macro · Keynes", "Economista", { capital: 0 });
  mk(bySlug.macro.id, "Macro · Powell", "Economista", { capital: 0 });
  mk(bySlug.analisis.id, "Análisis · Onchain", "Analista on-chain", { capital: 0 });
  mk(bySlug.analisis.id, "Análisis · Sentiment", "Analista sentimiento", { capital: 0 });
  mk(bySlug.cartera.id, "Cartera · Markowitz", "Portfolio Manager", { capital: 0 });
  mk(bySlug.quant.id, "Quant · Bayes", "Quant", { capital: 0 });
  mk(bySlug.quant.id, "ML · Tensor", "ML Engineer", { capital: 0 });
  mk(bySlug.lab.id, "Lab · Edison", "Optimizer", { capital: 0 });
  mk(bySlug.escuela.id, "Escuela · Mentor", "Mentor", { capital: 0 });
  mk(bySlug.bienestar.id, "Bienestar · Calma", "Psicología trading", { capital: 0 });
  mk(bySlug.infra.id, "Infra · Ping", "SRE", { capital: 0 });
  mk(bySlug.derivados.id, "Deriv · Vega", "Derivados", {});
  mk(bySlug.derivados.id, "Opciones · Theta", "Opciones", {});
  mk(bySlug.arbitraje.id, "Arb · Spread", "Arbitrajista", {});
  mk(bySlug.arbitraje.id, "Arb · Latencia", "Arbitrajista", {});

  // 158 traders para superar 156 de las capturas
  for (let i = 0; i < 158; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`;
    mk(bySlug.trading.id, `${name} · T${i + 1}`, "Trader", {});
  }
  // posiciones en la oficina (jitter determinista)
  const perDept = {};
  agents.forEach(a => {
    const d = departments.find(x => x.id === a.department_id);
    perDept[a.department_id] = (perDept[a.department_id] || 0) + 1;
    const k = perDept[a.department_id];
    const cols = a.department_id === bySlug.trading.id ? 14 : 4;
    const r = Math.floor((k - 1) / cols), c = (k - 1) % cols;
    a.x = Math.min(0.95, Math.max(0.05, d.x + (c - cols / 2) * 0.035 + (rnd() - 0.5) * 0.01));
    a.y = Math.min(0.95, Math.max(0.05, d.y + (r - 1.5) * 0.05 + (rnd() - 0.5) * 0.01));
  });

  const channels = [
    { id: "c-general", slug: "general", name: "Sala · General", department_id: null },
    ...departments.map(d => ({ id: `c-${d.slug}`, slug: d.slug, name: d.name, department_id: d.id })),
  ];
  const messages = [
    { id: "m-1", channel_id: "c-general", from_agent_id: agents[14].id, text: "Sin posición en SOL. Esperando que Setup_9373 dé señal.", kind: "idea", created_at: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
    { id: "m-2", channel_id: "c-general", from_agent_id: agents[15].id, text: "Café y vuelvo a la pantalla.", kind: "social", created_at: new Date(Date.now() - 1000 * 60 * 4).toISOString() },
    { id: "m-3", channel_id: "c-general", from_agent_id: agents[16].id, text: "Me voy por aqui, vadeo ensalada.", kind: "social", created_at: new Date(Date.now() - 1000 * 60 * 3).toISOString() },
    { id: "m-4", channel_id: "c-general", from_agent_id: agents[17].id, text: "Nada que hacer en TAO por ahora. Mejor no forzar.", kind: "analisis", created_at: new Date(Date.now() - 1000 * 60 * 2).toISOString() },
  ];

  return { departments, agents, channels, messages };
}

module.exports = { buildState, PAIRS };
