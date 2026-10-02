// Modo demo: simula el fondo 100% en el navegador cuando no hay backend.
// Misma forma de datos que la API para reutilizar toda la UI sin cambios.
const PAIRS = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "NEAR", "TRX", "LTC"];
const BASE: any = { BTC: 97400, ETH: 3620, SOL: 218, XRP: 2.31, BNB: 694, DOGE: 0.321, ADA: 0.98, AVAX: 41.2, LINK: 22.4, NEAR: 6.1, TRX: 0.27, LTC: 104 };
const NAMES = ["Noa", "Alba", "Marcos", "Amara", "Ainhoa", "Pablo", "Martina", "Aitana", "Claudia", "Mara", "Lucía", "Elena", "Mateo", "Vera", "Rubén", "Hugo", "Sara", "Iker", "Laia", "Nil", "Júlia", "Oriol", "Carla", "Dani", "Nora", "Izan", "Leire", "Arnau", "Jordi", "Marta", "Pol", "Anna", "Quim", "Laia", "Marc", "Núria"];
const SURNAMES = ["Singh", "Serrano", "García", "Ortega", "Vega", "Molina", "Herrera", "Navarro", "Torres", "Cano", "Rubio", "López", "Miller", "Chan", "Duarte", "Vidal", "Costa", "Ferrer", "Soler", "Puig"];
const SETUPS = ["Tendencia BTC 1h", "Breakout SOL 15m", "MeanRev ETH 1h", "Scalp ADA 5m", "Swing AVAX 4h", "SMA 7-25 BTC 1D", "RSI LINK 1h", "Funding ARB 15m", "EMA DOGE 1h", "Donchian XRP 4h"];
const STATUS = ["analizando", "hablando", "operando", "estudiando", "descansando"];
const DEPTS = [
  ["direccion", "Dirección", "CIO asigna capital y preside comité"],
  ["riesgos", "Riesgos", "Límites, kill-switch y suspensiones"],
  ["macro", "Macroeconomía", "Contexto macro risk-on/off"],
  ["analisis", "Análisis", "Técnico, on-chain y sentimiento"],
  ["cartera", "Gestión Cartera", "Asignación y rebalanceo"],
  ["trading", "Sala de Trading", "Traders operando"],
  ["derivados", "Derivados", "Futuros, opciones y coberturas"],
  ["arbitraje", "Arbitraje", "Spreads entre venues"],
  ["quant", "Cuantitativo + ML", "Modelos y backtests"],
  ["lab", "Laboratorio", "Mejora de estrategias"],
  ["escuela", "Escuela", "Formación continua"],
  ["bienestar", "Bienestar", "Anti-tilt y sesgos"],
  ["infra", "Infraestructura", "Latencia y salud"],
];
const CHAT = [
  "Sin posición en {P}. Esperando que la setup dé señal.",
  "Sesgo alcista en {P}, sobre la media de 50. Vigilo entrada.",
  "Funding alto en {P}, mejor no forzar largos.",
  "RSI sobrecomprado en {P} 1h. Espero retroceso.",
  "Ruptura con volumen en {P}. Confirmo y entro.",
  "Nada claro en {P} por ahora. Paciencia.",
  "Cierro la mitad, dejo correr el resto en {P}.",
  "Café y vuelvo a la pantalla.",
];
let n = 0;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)];

export function initDemo(seed?: any) {
  if (seed && seed.agents && seed.agents.length) return fromSeed(seed);
  const departments = DEPTS.map(([slug, name, description], i) => ({ id: "d-" + slug, slug, name, description, headcount: 0, x: 0.2 + (i % 5) * 0.15, y: 0.2 + Math.floor(i / 5) * 0.22 }));
  const agents: any[] = [];
  const per: any = { trading: 26, direccion: 1, riesgos: 2, macro: 2, analisis: 2, cartera: 1, derivados: 1, arbitraje: 1, quant: 1, lab: 1, escuela: 1, bienestar: 1, infra: 1 };
  Object.entries(per).forEach(([slug, count]: any) => {
    const d = departments.find(x => x.slug === slug)!;
    for (let i = 0; i < count; i++) {
      n++;
      agents.push({
        id: "demo-" + n, name: `${pick(NAMES)} ${pick(SURNAMES)}`, role: slug === "trading" ? "Trader" : "Analista",
        department_id: d.id, strategy: pick(SETUPS), pair: pick(PAIRS), timeframe: pick(["5m", "15m", "1h", "4h", "1D"]),
        leverage: 1 + Math.floor(Math.random() * 4), status: pick(STATUS), mood: pick(["enfocado", "neutral", "confiado", "cauto"]),
        level_risk: 1 + Math.floor(Math.random() * 4), level_ta: 1 + Math.floor(Math.random() * 4),
        studying: pick(["Gestión de riesgo", "Análisis técnico", "Macro", "Psicología"]),
        pnl: rnd(-18, 24), win_rate: rnd(38, 66), profit_factor: rnd(0.9, 2.1), drawdown: rnd(0.5, 6),
        trades_count: Math.floor(rnd(2, 40)), x: d.x + rnd(-0.05, 0.05), y: d.y + rnd(-0.05, 0.05),
        last_reason: "Demo local: esperando señal del mercado simulado.",
      });
    }
    d.headcount = count;
  });
  const prices: any = { ...BASE };
  return {
    agents, departments,
    msgs: [
      { id: "dm-1", from: "Dirección CIO", kind: "alerta", text: "MODO DEMO: estás viendo una simulación local. Conecta el backend para datos reales.", created_at: new Date().toISOString() },
      { id: "dm-2", from: pick(agents).name, kind: "idea", text: "Sesgo alcista en BTC, sobre la media de 50. Vigilo entrada.", created_at: new Date().toISOString() },
    ],
    prices, funding: 0.01, fear_greed: 62, risk_mode: "RISK-ON",
    equity: 512.4, dayPnl: 12.4, msgN: 3, opN: 1,
  };
}

// Semilla REAL del motor (vía snapshot.json generado por GitHub Actions).
function fromSeed(seed: any) {
  const departments = (seed.departments || []).map((d: any, i: number) => ({
    ...d, x: 0.2 + (i % 5) * 0.15, y: 0.2 + Math.floor(i / 5) * 0.22,
    headcount: seed.agents.filter((a: any) => a.department_id === d.id).length,
  }));
  const agents = seed.agents.map((a: any) => ({
    studying: "Gestión de riesgo", trades_count: 0, win_rate: 50, profit_factor: 1,
    drawdown: 0, mood: "enfocado", leverage: 2, timeframe: "1h", last_reason: "Semilla del motor real.",
    ...a,
  }));
  const msgs = (seed.messages || []).map((m: any, i: number) => ({ id: m.id || ("seed-" + i), ...m }));
  return {
    agents, departments, msgs,
    prices: { ...(seed.market?.prices || BASE) },
    funding: seed.market?.funding ?? 0.01, fear_greed: seed.market?.fear_greed ?? 55,
    risk_mode: seed.market?.risk_mode || "RISK-ON",
    equity: seed.portfolio?.patrimonio ?? 500, dayPnl: seed.portfolio?.resultado_hoy ?? 0,
    seedMeta: { generated_at: seed.generated_at, ranking: seed.ranking, setups: seed.setups, report: seed.report, memory: seed.memory, school: seed.school, meetings: seed.meetings, desks: seed.desks, labStats: seed.labStats },
    msgN: 5000, opN: 1,
  };
}

export function tickDemo(s: any) {
  for (const k of Object.keys(s.prices)) s.prices[k] = Math.max(0.0001, s.prices[k] * (1 + (Math.random() - 0.5) * 0.004));
  s.funding = rnd(0, 0.05); s.fear_greed = Math.floor(rnd(30, 80));
  s.risk_mode = Math.random() > 0.3 ? "RISK-ON" : "RISK-OFF";
  const agents = s.agents.map((a: any) => {
    const shock = (Math.random() - 0.48) * 1.1;
    const status = Math.random() > 0.86 ? pick(STATUS) : a.status;
    return { ...a, pnl: Math.round((a.pnl + shock) * 100) / 100, status, trades_count: a.trades_count + (Math.random() > 0.93 ? 1 : 0) };
  });
  const tot = agents.filter((a: any) => a.role === "Trader").reduce((x: number, a: any) => x + a.pnl, 0);
  const dayPnl = Math.round(tot * 100) / 100;
  const newMsgs: any[] = [];
  for (let i = 0; i < (Math.random() > 0.4 ? 1 : 2); i++) {
    const a = pick(agents);
    newMsgs.push({ id: "dm-" + (s.msgN++), from: a.name, kind: Math.random() > 0.85 ? "analisis" : "idea", text: pick(CHAT).replace("{P}", a.pair), created_at: new Date().toISOString() });
  }
  const market = { prices: { ...s.prices }, funding: Math.round(s.funding * 10000) / 10000, fear_greed: s.fear_greed, risk_mode: s.risk_mode };
  const portfolio = { patrimonio: Math.round((500 + dayPnl) * 100) / 100, resultado_hoy: dayPnl, exposicion_bruta: Math.round(rnd(40, 120) * 10) / 10, caida: Math.round(rnd(0, 2) * 100) / 100, posiciones: Math.floor(rnd(6, 18)), objetivo: 50, costes_pagados: Math.round(rnd(2, 9) * 100) / 100 };
  const ranking = agents.filter((a: any) => a.role === "Trader").sort((x: any, y: any) => y.pnl - x.pnl).slice(0, 50)
    .map((a: any, i: number) => ({ rank: i + 1, id: a.id, name: a.name, setup: a.strategy, pair: a.pair, pnl: a.pnl, hoy: a.pnl, win_rate: a.win_rate }));
  return { ...s, agents, market, portfolio, ranking, newMsgs };
}

// Deriva visual para modo nube: SOLO lo efímero se mueve (precios, estados,
// micro-variación de patrimonio acotada ±4€, chat marcado [simulado]).
// Ranking, ops, riesgo, informe, memoria y escuela quedan congelados en el latido real.
export function cloudDrift(s: any) {
  const prices = { ...s.prices };
  for (const k of Object.keys(prices)) prices[k] = Math.max(0.0001, (prices as any)[k] * (1 + (Math.random() - 0.5) * 0.003));
  const agents = s.agents.map((a: any) => (Math.random() > 0.94 ? { ...a, status: pick(STATUS) } : a));
  const drift = Math.max(-4, Math.min(4, (s.drift || 0) + (Math.random() - 0.5) * 0.5));
  const market = { prices, funding: s.funding, fear_greed: s.fear_greed, risk_mode: s.risk_mode };
  const portfolio = {
    patrimonio: Math.round((s.equity + drift) * 100) / 100, resultado_hoy: Math.round((s.dayPnl + drift) * 100) / 100,
    exposicion_bruta: 62, caida: 0.8, posiciones: 11, objetivo: 50, costes_pagados: 3.2,
  };
  const simMsg = Math.random() > 0.93
    ? [{ id: "sim-" + (s.msgN++), from: pick(agents).name, kind: "idea", text: "[simulado] " + pick(CHAT).replace("{P}", pick(PAIRS)), created_at: new Date().toISOString() }]
    : [];
  return { ...s, agents, market, portfolio, drift, simMsg };
}
