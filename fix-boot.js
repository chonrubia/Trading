const fs = require("fs");
const P = "web/components/FloorApp.tsx";
const L = fs.readFileSync(P, "utf8").split("\n");
const idx = p => L.findIndex((l, i) => i >= (p || 0) && l.includes(p === undefined ? "" : ""));
// 1. cortar demoTick..fin de startCloud
let a = L.findIndex(l => l.includes("const demoTick = () => {"));
let b = L.findIndex(l => l.includes("iv3 = setInterval(ageTick, 30000);"));
if (a < 0 || b < 0) throw new Error("marcas demo no encontradas");
let c = b;
while (c < L.length && L[c].trim() !== "};") c++;
const cut = L.splice(a, c - a + 1);
console.log("cortadas " + cut.length + " lineas demo/nube");
// 2. boot en vivo
const bootNew = [
  "    const boot = async () => {",
  "      try {",
  "        await apiFetch(\"/api/agents?limit=200\").then(r => r.json()).then(setAgents);",
  "        await apiFetch(\"/api/departments\").then(r => r.json()).then(setDepts);",
  "        await apiFetch(\"/api/channels/c-general/messages\").then(r => r.json()).then(setMsgs);",
  "        if (stop) return;",
  "        setOnline(true);",
  "        refresh();",
  "      } catch { setOnline(false); }",
  "    };",
  "    boot();",
  "    const id = setInterval(refresh, 8000);",
  "    const fl = async () => {",
  "      try {",
  "        const d = await apiFetch(\"/api/floor\").then(r => r.json());",
  "        setPortfolio((p: any) => ({ ...p, patrimonio: d.equity, resultado_hoy: d.dayPnl, exposicion_bruta: d.exposure, caida: d.drawdown, costes_pagados: p.costes_pagados, objetivo: p.objetivo }));",
  "        setMarket(d.tick); setCommittee(!!d.committee);",
  "        setOps(d.openOps || []);",
  "        if (d.msgs?.length) setMsgs(d.msgs);",
  "        setAgents((prev: any[]) => {",
  "          const m = new Map<string, any>((d.agents || []).map((x: any) => [x.id, x]));",
  "          return prev.map((x: any) => (m.has(x.id) ? { ...x, ...(m.get(x.id) as object) } : x));",
  "        });",
  "        if (d.kill !== undefined) setRiskInfo((r: any) => ({ ...r, kill: d.kill, exposure: d.exposure }));",
  "        setOnline(true);",
  "      } catch { setOnline(false); }",
  "    };",
  "    fl();",
  "    const id2 = setInterval(fl, 8000);",
].join("\n");
// localizar (async () => { ... })(); y cleanup antiguos
let d0 = L.findIndex(l => l.trim() === "(async () => {");
if (d0 < 0) throw new Error("boot no encontrado");
let d1 = d0;
while (d1 < L.length && L[d1].trim() !== "})();") d1++;
let e0 = L.findIndex((l, i) => i > d1 && l.includes("return () => { stop = true;"));
if (e0 < 0) throw new Error("cleanup no encontrado");
let e1 = e0;
while (e1 < L.length && !L[e1].includes("}, []);")) e1++;
const before = L.slice(0, d0).join("\n");
const after = L.slice(e1 + 1).join("\n");
const out = before + bootNew + "\n    return () => { stop = true; clearInterval(id); clearInterval(id2); };\n  }, []);\n" + after;
fs.writeFileSync(P, out);
console.log("boot en vivo instalado");
