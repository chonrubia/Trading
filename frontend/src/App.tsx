import { useEffect, useRef, useState } from "react";
import IsoOffice from "./IsoOffice";
import { apiFetch, wsEndpoint } from "./api";
import { initDemo, tickDemo } from "./demo";

type Agent = any; type Dept = any; type Msg = any;

const eur = (v: any) => (v === null || v === undefined || v === "" || isNaN(Number(v))) ? "—" : `${Number(v).toFixed(2)}€`;
const pcl = (v: any) => Number(v) > 0 ? "pos" : Number(v) < 0 ? "neg" : "flat";
const hhmm = (ts: string) => (ts && ts.length >= 19 ? ts.slice(11, 19) : "");
const hueOf = (s: string) => { let h = 0; const t = String(s || "?"); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) % 360; return h; };
const STATUS_ES: any = { hablando: "hablando", analizando: "analizando", operando: "operando", estudiando: "estudiando", descansando: "descansando" };
const KIND_ES: any = { idea: "idea", analisis: "análisis", alerta: "alerta", humano: "tú", respuesta: "resp.", mentoring: "mentor", social: "sala" };

export default function App() {
  const [tab, setTab] = useState<"Sala" | "Ranking" | "Deptos" | "Ops" | "Riesgo" | "Learn" | "Lab" | "Mesas">("Sala");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [ranking, setRanking] = useState<any[]>([]);
  const [ops, setOps] = useState<any[]>([]);
  const [riskInfo, setRiskInfo] = useState<any>({ limits: {}, exposure: 0, kill: false });
  const [meetings, setMeetings] = useState<any[]>([]);
  const [committee, setCommittee] = useState(false);
  const [market, setMarket] = useState<any>({ prices: {} });
  const [portfolio, setPortfolio] = useState<any>({ patrimonio: 500, resultado_hoy: 0, exposicion_bruta: 0, caida: 0, posiciones: 0 });
  const [sel, setSel] = useState<Agent | null>(null);
  const [text, setText] = useState("");
  const [memList, setMemList] = useState<any[]>([]);
  const [schoolTop, setSchoolTop] = useState<any[]>([]);
  const [auditList, setAuditList] = useState<any[]>([]);
  const [memQ, setMemQ] = useState("");
  const [memText, setMemText] = useState("");
  const [lab, setLab] = useState<any[]>([]);
  const [labStats, setLabStats] = useState<any>({});
  const [desks, setDesks] = useState<any>({ venues: [], pnl: {} });
  const [report, setReport] = useState<any>(null);
  const [setups, setSetups] = useState<any[]>([]);
  const [online, setOnline] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [seedDate, setSeedDate] = useState<string | null>(null);
  const demoRef = useRef<any>(null);
  const chatRef = useRef<HTMLDivElement>(null);

  const refresh = () => {
    apiFetch("/api/ranking").then(r => r.json()).then(setRanking).catch(() => {});
    apiFetch("/api/operations?limit=30").then(r => r.json()).then(setOps).catch(() => {});
    apiFetch("/api/risk").then(r => r.json()).then(setRiskInfo).catch(() => {});
    apiFetch("/api/meetings").then(r => r.json()).then(setMeetings).catch(() => {});
    apiFetch("/api/market").then(r => r.json()).then(setMarket).catch(() => {});
    apiFetch("/api/memory?limit=20").then(r => r.json()).then(setMemList).catch(() => {});
    apiFetch("/api/school/leaderboard").then(r => r.json()).then(setSchoolTop).catch(() => {});
    apiFetch("/api/audit?limit=20").then(r => r.json()).then(setAuditList).catch(() => {});
    apiFetch("/api/incubator").then(r => r.json()).then(setLab).catch(() => {});
    apiFetch("/api/incubator/stats").then(r => r.json()).then(setLabStats).catch(() => {});
    apiFetch("/api/desks").then(r => r.json()).then(setDesks).catch(() => {});
    apiFetch("/api/report").then(r => r.json()).then(setReport).catch(() => {});
    apiFetch("/api/setups").then(r => r.json()).then(setSetups).catch(() => {});
  };

  useEffect(() => {
    let stop = false; let iv: any = null; let ws: any = null;
    const demoTick = () => {
      if (!demoRef.current) return;
      const d = tickDemo(demoRef.current);
      demoRef.current = d;
      setAgents(d.agents); setMarket(d.market); setPortfolio(d.portfolio); setRanking(d.ranking);
      if (d.newMsgs.length) setMsgs(m => [...m, ...d.newMsgs].slice(-120));
    };
    const startDemo = async () => {
      if (stop || demoRef.current) return;
      let snap: any = null;
      try {
        const ctl2 = new AbortController(); const to2 = setTimeout(() => ctl2.abort(), 4000);
        const r = await fetch("snapshot.json", { signal: ctl2.signal }); clearTimeout(to2);
        if (r.ok) snap = await r.json();
      } catch {}
      demoRef.current = initDemo(snap);
      const d = demoRef.current;
      const meta = d.seedMeta || {};
      setAgents(d.agents); setDepts(d.departments); setMsgs(d.msgs); setMarket({ prices: d.prices, funding: d.funding, fear_greed: d.fear_greed, risk_mode: d.risk_mode });
      setPortfolio({ patrimonio: d.equity, resultado_hoy: d.dayPnl, exposicion_bruta: 62, caida: 0.8, posiciones: 11, objetivo: 50, costes_pagados: 3.2 });
      setRanking(meta.ranking || []); setOnline(false); setDemoMode(true);
      setRiskInfo({ limits: { max_day_loss: -15, max_drawdown: 10, max_exposure_gross: 150 }, dayPnl: d.dayPnl, drawdown: 0.8, exposure: 62, open: 11, blocked: 2, suspended: [], kill: false });
      setDesks({ venues: [], funding: d.funding, arbOpen: [], derivadosOpen: [], hedge: null, signal: "-", pnl: meta.desks?.pnl || { spot: d.dayPnl, arbitraje: 0, derivados: 0, cobertura: 0 } });
      setReport(meta.report ? { ...meta.report, verdict: "motor real (" + (meta.generated_at || "?").slice(0, 10) + ") + demo en vivo" } : { verdict: "demo local", net: d.dayPnl, fees_paid: 3.2, costs_drag: "—", win_rate: "51%", profit_factor: 1.1, sharpe: 0.4, days: 0, green_days: "0/0", trades: { closed: 34, open: 11, blocked: 2, block_rate: "5%" }, desk_net: { spot: d.dayPnl }, block_reasons: {} });
      setOps([{ id: "demo-op-1", desk: "spot", status: "abierta", agent_name: d.agents[5].name, side: "LONG", pair: "BTC", pnl: 1.2, risk_note: "Demo local" }]);
      setLabStats(meta.labStats || { total: 6, incubacion: 3, lista: 1, activas: 2 }); setLab([]);
      setSetups(meta.setups || [{ strategy: "Tendencia BTC 1h", avg: 1.8, win: 58, trades: 12 }, { strategy: "Breakout SOL 15m", avg: 0.9, win: 52, trades: 9 }]);
      setSchoolTop(meta.school || d.agents.slice(0, 8).map((a: any, i: number) => ({ id: a.id, name: a.name, level: 2, xp: 120 - i * 9 })));
      if (!meta.memory) setMemList([{ id: "dm-mem", pair: "BTC", author: "Dirección CIO", text: "Demo local: la memoria compartida funciona igual que en el fondo real.", created_at: new Date().toISOString() }]);
      else setMemList(meta.memory);
      setAuditList([{ ev: meta.generated_at ? "seed motor " + meta.generated_at.slice(0, 16) : "demo.boot", ts: new Date().toISOString() }]); setMeetings(meta.meetings || []);
      if (meta.generated_at) setSeedDate(meta.generated_at.slice(0, 16).replace("T", " "));
      iv = setInterval(demoTick, 2000);
    };
    (async () => {
      try {
        const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
        await apiFetch("/api/health", { signal: ctl.signal }).then(r => { if (!r.ok) throw new Error("down"); return r.json(); });
        clearTimeout(to);
        if (stop) return;
        apiFetch("/api/agents?limit=200").then(r => r.json()).then(setAgents).catch(() => {});
        apiFetch("/api/departments").then(r => r.json()).then(setDepts).catch(() => {});
        apiFetch("/api/channels/c-general/messages").then(r => r.json()).then(setMsgs).catch(() => {});
        setOnline(true);
        refresh();
        iv = setInterval(refresh, 8000);
        ws = new WebSocket(wsEndpoint());
    ws.onopen = () => setOnline(true);
    ws.onclose = () => setOnline(false);
    ws.onerror = () => setOnline(false);
    ws.onmessage = (ev: any) => {
      const d = JSON.parse(ev.data);
      if (d.type === "chat") setMsgs(m => [...m.slice(-120), d.msg]);
      if (d.type === "tick") {
        setPortfolio((p: any) => ({ ...p, patrimonio: d.equity, resultado_hoy: d.dayPnl, exposicion_bruta: d.exposure, caida: d.drawdown, posiciones: undefined, costes_pagados: p.costes_pagados, objetivo: p.objetivo }));
        setMarket(d.tick); setCommittee(!!d.committee);
        setAgents((prev: any[]) => { const m = new Map<string, any>(d.agents.map((a: any) => [a.id, a])); return prev.map((a: any) => m.has(a.id) ? { ...a, ...(m.get(a.id) as object) } : a); });
        if (d.kill !== undefined) setRiskInfo((r: any) => ({ ...r, kill: d.kill, exposure: d.exposure }));
      }
      if (d.type === "init") { setAgents(d.agents); setDepts(d.departments); setCommittee(!!d.committee?.active); }
      if (d.type === "operation") { setOps(o => [d.op, ...o].slice(0, 60)); refresh(); }
      if (d.type === "committee") {
        if (d.phase === "started") setCommittee(true);
        if (d.phase === "ended") { setCommittee(false); setMeetings(m => [d.summary, ...m].slice(0, 10)); refresh(); }
      }
      if (d.type === "risk") setRiskInfo((r: any) => ({ ...r, kill: d.kill }));
      if (d.type === "memory") setMemList(m => [d.entry, ...m].slice(0, 40));
      if (d.type === "incubator") refresh();
    };
    } catch { startDemo(); }
    })();
    return () => { stop = true; clearInterval(iv); try { ws && ws.close(); } catch {} };
  }, []);

  useEffect(() => { const el = chatRef.current; if (el) el.scrollTop = el.scrollHeight; }, [msgs]);

  const send = async () => {
    if (!text.trim()) return;
    if (demoMode) {
      const t = text; setText("");
      demoSay("Tú", "humano", t);
      setTimeout(() => {
        const a = demoRef.current?.agents[Math.floor(Math.random() * demoRef.current.agents.length)];
        if (a) demoSay(a.name, "respuesta", `Recibido (demo). Lo miro con ${a.strategy} en ${a.pair}.`);
      }, 800);
      return;
    }
    await apiFetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channel_id: "c-general", text, to_agent_id: sel?.id || null }) });
    setText("");
  };
  const pick = (id: string) => {
    if (demoMode) { const a = (demoRef.current?.agents || []).find((x: any) => x.id === id); if (a) setSel({ ...a, school: [], ops: [] }); return; }
    apiFetch(`/api/agents/${id}`).then(r => r.json()).then(setSel);
  };
  const demoSay = (from: string, kind: string, text: string) => setMsgs(m => [...m.slice(-120), { id: "dm-" + Date.now() + Math.random(), from, kind, text, created_at: new Date().toISOString() }]);
  const startCommittee = async () => {
    if (demoMode) { setCommittee(true); demoSay("Dirección CIO", "alerta", "Comité demo convocado: toda la oficina a la sala."); return; }
    await apiFetch("/api/committee/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: "Revisión riesgos + ranking" }) });
  };
  const endCommittee = async () => {
    if (demoMode) { setCommittee(false); demoSay("Dirección CIO", "alerta", "Comité demo cerrado: mantener operativa con prudencia."); return; }
    await apiFetch("/api/committee/end", { method: "POST" });
  };
  const toggleKill = async () => {
    if (demoMode) { const k = !riskInfo.kill; setRiskInfo((x: any) => ({ ...x, kill: k })); demoSay("Riesgo · Sato", "alerta", k ? "Kill-switch demo ACTIVADO." : "Kill-switch demo liberado."); return; }
    const r = await apiFetch("/api/risk/kill", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !riskInfo.kill }) }).then(r => r.json()); setRiskInfo((x: any) => ({ ...x, kill: r.kill }));
  };
  const propose = async () => {
    if (!sel) return;
    if (demoMode) {
      const side = Math.random() > 0.5 ? "LONG" : "SHORT";
      setOps(o => [{ id: "dm-op-" + Date.now(), desk: "spot", status: "abierta", agent_name: sel.name, side, pair: sel.pair, pnl: 0, risk_note: "Demo local (sin Riesgos)" }, ...o].slice(0, 60));
      demoSay(sel.name, "idea", `Demo: propongo ${side} en ${sel.pair} (simulado).`);
      return;
    }
    const side = Math.random() > 0.5 ? "LONG" : "SHORT";
    const op = await apiFetch("/api/operations/propose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent_id: sel.id, side, size: 0.01 }) }).then(r => r.json());
    setOps(o => [op, ...o].slice(0, 60)); pick(sel.id);
  };
  const suspend = async () => {
    if (!sel) return;
    if (demoMode) { setSel({ ...sel, suspended: !sel.suspended }); demoSay("Riesgo · Sato", "alerta", `Demo: ${sel.name} ${sel.suspended ? "reactivado" : "suspendido"} (simulado).`); return; }
    await apiFetch("/api/risk/suspend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agent_id: sel.id, active: !sel.suspended }) });
    pick(sel.id); refresh();
  };

  const prices = market?.prices || {};
  const tape = Object.entries(prices).slice(0, 12);
  const mode = riskInfo.kill ? "kill" : committee ? "comite" : "paper";
  const modeTxt = demoMode ? "MODO DEMO · SIMULADO" : riskInfo.kill ? "⛔ DETENIDO" : committee ? "COMITÉ EN SALA" : "PAPEL · TIEMPO REAL";
  const tgt = Number(portfolio.objetivo || 50), day = Number(portfolio.resultado_hoy || 0);
  const tgtPct = Math.max(0, Math.min(100, (day / tgt) * 100));

  return (<>
    <header className="topbar">
      <div className="brand">
        <div className="logo">MB</div>
        <div>
          <h1>Money Beast Capital<small>TRADING FLOOR</small></h1>
          <span className={`modepill ${mode}`}>{modeTxt}</span>
        </div>
      </div>
      <div className="stats">
        <div className="stat"><label>PATRIMONIO</label><b>{eur(portfolio.patrimonio)}</b></div>
        <div className="stat"><label>RESULTADO HOY</label><b className={pcl(portfolio.resultado_hoy)}>{eur(portfolio.resultado_hoy)}</b></div>
        <div className="stat"><label>CAÍDA</label><b className={Number(portfolio.caida) > 3 ? "neg" : "flat"}>{portfolio.caida ?? "—"}%</b></div>
        <div className="stat"><label>EXPOSICIÓN</label><b className={Number(portfolio.exposicion_bruta ?? riskInfo.exposure) > 130 ? "neg" : "flat"}>{portfolio.exposicion_bruta ?? riskInfo.exposure ?? "—"}%</b></div>
        <div className="stat"><label>POSICIONES</label><b>{portfolio.posiciones ?? riskInfo.open ?? "—"}</b></div>
        <div className="stat" style={{ minWidth: 150 }}>
          <label>OBJETIVO {eur(tgt)}/DÍA</label>
          <b className={pcl(day)}>{eur(day)}</b>
          <div className="bar"><i style={{ width: `${tgtPct}%` }} /></div>
        </div>
      </div>
      <div className="topactions">
        {!committee
          ? <button className="btn primary" onClick={startCommittee}>Convocar comité</button>
          : <button className="btn warn" onClick={endCommittee}>Cerrar comité</button>}
        <button className="btn danger" onClick={toggleKill}>{riskInfo.kill ? "Reanudar" : "Kill switch"}</button>
      </div>
    </header>

    <div className="tabbar">
      <div className="tabs">
        {(["Sala", "Ranking", "Deptos", "Ops", "Riesgo", "Learn", "Lab", "Mesas"] as const).map(t => <button key={t} className={"btn" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t === "Deptos" ? "Departamentos" : t === "Ops" ? "Operaciones" : t}</button>)}
      </div>
      <div className="spacer" />
      <span style={{ fontSize: 11, color: "var(--faint)", fontFamily: "var(--mono)" }}>FUND {market.funding}% · FG {market.fear_greed} · {market.risk_mode}</span>
    </div>

    <div className="ticker"><div className="ticker-track">
      {[...tape, ...tape].map(([k, v]: any, i: number) => <span className="tick" key={i}><span>{k}</span><b>{v}</b></span>)}
    </div></div>

    {!online && <div className="offline">{seedDate ? `DATOS DEL MOTOR REAL (${seedDate} UTC) + SIMULACIÓN EN VIVO · sin backend conectado` : "MODO DEMO · simulación local en tu navegador (sin backend). Todo lo que ves es simulado."}</div>}

    <div className="layout">
      <div className="panel">
        <div className="phead"><span className="dot" /><h3>SALA · CHAT GENERAL</h3></div>
        <div className="pbody" ref={chatRef}>
          {msgs.slice(-40).map(m => (
            <div key={m.id} className="chatmsg">
              <div className="avatar" style={{ background: `hsl(${hueOf(m.from)} 70% 62%)` }}>{(m.from || "?")[0]}</div>
              <div className="chatbody">
                <div className="chatmeta"><b>{m.from || "?"}</b><span className={`kind ${m.kind || "idea"}`}>{KIND_ES[m.kind] || m.kind || "idea"}</span><time>{hhmm(m.created_at)}</time></div>
                <div className="chattext">{m.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="pfoot"><input className="chatinput" value={text} onChange={e => setText(e.target.value)} placeholder={sel ? `Hablar con ${sel.name}…` : "Escribir en la sala…"} onKeyDown={e => e.key === "Enter" && send()} /></div>
      </div>

      <div className="panel floor">
        <div className="floor-head">
          <strong style={{ color: "var(--lime)", letterSpacing: 2, fontSize: 11 }}>OFICINA · VISTA ISOMÉTRICA</strong>
          <div className="legend">
            {(Object.keys(STATUS_ES) as string[]).map(s => <span key={s}><span className={`status st-${s}`} />{s}</span>)}
          </div>
        </div>
        <div className="floor-wrap">
          <IsoOffice agents={agents} departments={depts} selectedId={sel?.id} onSelect={pick} meeting={committee} />
          {committee && <div className="comite-banner">COMITÉ EN SALA · TODOS LOS AGENTES REUNIDOS</div>}
        </div>
      </div>

      <div className="panel">
        {tab === "Sala" && sel && (<>
          <div className="phead"><h3>FICHA DEL AGENTE</h3></div>
          <div className="pbody">
            <div className="agenthead">
              <div className="avatar" style={{ background: `hsl(${hueOf(sel.name)} 70% 62%)` }}>{(sel.name || "?")[0]}</div>
              <div><h2>{sel.name} {sel.suspended ? "⛔" : ""}</h2><small>{sel.role}</small></div>
            </div>
            <div className="statgrid">
              <div className="cell"><label>ESTRATEGIA</label><b style={{ fontSize: 11.5 }}>{sel.strategy}</b></div>
              <div className="cell"><label>PAR / TF / LEV</label><b>{sel.pair} · {sel.timeframe} · {sel.leverage}x</b></div>
              <div className="cell"><label>PnL</label><b className={pcl(sel.pnl)}>{eur(sel.pnl)}</b></div>
              <div className="cell"><label>OPERACIONES</label><b>{sel.trades_count}</b></div>
              <div className="cell"><label>WIN RATE</label><b>{sel.win_rate}%</b></div>
              <div className="cell"><label>PROFIT FACTOR</label><b>{sel.profit_factor}</b></div>
              <div className="cell"><label>DRAWDOWN</label><b>{sel.drawdown}%</b></div>
              <div className="cell"><label>ESTADO</label><b><span className={`status st-${sel.status}`} />{STATUS_ES[sel.status] || sel.status} · {sel.mood}</b></div>
            </div>
            <div className="row"><span>Escuela</span><span>Riesgo N{sel.level_risk} · TA N{sel.level_ta} · {sel.studying}</span></div>
            <div className="quote">{sel.last_reason}</div>
            <div className="btnrow"><button className="btn primary" onClick={propose}>Proponer trade</button><button className="btn danger" onClick={suspend}>{sel.suspended ? "Reactivar" : "Suspender"}</button></div>
            {(sel.school || []).slice(0, 4).map((l: any, i: number) => <div key={i} className="row"><span>🎓 {l.subject} +{l.xp}xp N{l.level}</span><span>{l.note?.slice(0, 34)}</span></div>)}
            {(sel.ops || []).slice(-5).reverse().map((o: any) => <div key={o.id} className="row"><span><span className={`chip ${o.status}`}>{o.status}</span> {o.side} {o.pair}</span><span className={pcl(o.pnl)}>{eur(o.pnl)}</span></div>)}
          </div>
        </>)}
        {tab === "Sala" && !sel && <><div className="phead"><h3>FICHA DEL AGENTE</h3></div><div className="pbody"><div className="quote">Clica un avatar de la oficina para ver su ficha: estrategia, métricas, formación y chat directo. También puedes proponerle un trade (pasa por Riesgos) o suspenderlo.</div></div></>}
        {tab === "Ranking" && <><div className="phead"><h3>RANKING · POR RENTABILIDAD</h3></div><div className="pbody">
          {ranking.map(r => (
            <div key={r.id} className="rank" onClick={() => pick(r.id)}>
              <div className={"medal" + (r.rank <= 3 ? " r" + r.rank : "")}>{r.rank}</div>
              <div className="who"><b>{r.name} {r.suspended ? "⛔" : ""}</b><small>{r.setup} · {r.pair}</small></div>
              <div className={`pnl ${pcl(r.pnl)}`}>{eur(r.pnl)}</div>
            </div>
          ))}
        </div></>}
        {tab === "Deptos" && <><div className="phead"><h3>DEPARTAMENTOS ({depts.length})</h3></div><div className="pbody">
          {depts.map(d => <div key={d.id} className="rank"><div className="medal">{d.headcount}</div><div className="who"><b>{d.name}</b><small>{d.description}</small></div><div className="pnl flat" style={{ fontSize: 11 }}>{d.riesgos?.exposicion_bruta}</div></div>)}
        </div></>}
        {tab === "Ops" && <><div className="phead"><h3>OPERACIONES</h3></div><div className="pbody">
          {ops.map(o => <div key={o.id} className="row"><span><span className="chip desk">{o.desk || "spot"}</span><span className={`chip ${o.status}`}>{o.status}</span> {o.agent_name} {o.side} {o.pair}</span><span className={pcl(o.pnl)}>{eur(o.pnl)}</span></div>)}
        </div></>}
        {tab === "Learn" && <><div className="phead"><h3>MEMORIA · ESCUELA · AUDITORÍA</h3></div><div className="pbody">
          <h3 className="section">Memoria compartida</h3>
          <input className="chatinput" value={memQ} onChange={e => setMemQ(e.target.value)} placeholder="Buscar memoria… BTC, riesgo…" onKeyDown={async e => { if (e.key === "Enter") setMemList(await fetch(`/api/memory?q=${encodeURIComponent(memQ)}&limit=20`).then(r => r.json())); }} />
          <input className="chatinput" value={memText} onChange={e => setMemText(e.target.value)} placeholder="Aportar análisis a la memoria… (Enter)" onKeyDown={async e => { if (e.key === "Enter" && memText.trim()) { const en = await apiFetch("/api/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: memText, pair: sel?.pair || "BTC" }) }).then(r => r.json()); setMemList(m => [en, ...m].slice(0, 40)); setMemText(""); } }} />
          {memList.slice(0, 8).map(m => <div key={m.id} className="chatmsg"><div className="chatbody"><div className="chatmeta"><b>[{m.pair}] {m.author}</b><time>{hhmm(m.created_at)}</time></div><div className="chattext">{m.text}</div></div></div>)}
          <h3 className="section">Escuela · XP</h3>
          {schoolTop.map(s => <div key={s.id} className="row"><span>N{s.level} · {s.name}</span><span>{s.xp} xp</span></div>)}
          <h3 className="section">Auditoría</h3>
          {auditList.slice(0, 8).map((a, i) => <div key={i} className="row"><span>{a.ev}</span><span>{hhmm(a.ts)}</span></div>)}
        </div></>}
        {tab === "Lab" && <><div className="phead"><h3>INCUBADORA · MINERO 24/7</h3></div><div className="pbody">
          <div className="statgrid">
            <div className="cell"><label>TOTAL</label><b>{labStats.total || 0}</b></div>
            <div className="cell"><label>INCUBACIÓN</label><b>{labStats.incubacion || 0}</b></div>
            <div className="cell"><label>LISTAS</label><b>{labStats.lista || 0}</b></div>
            <div className="cell"><label>ACTIVAS</label><b className="pos">{labStats.activas || 0}</b></div>
          </div>
          <div className="btnrow"><button className="btn primary" onClick={async () => { const out = await apiFetch("/api/incubator/mine", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ n: 5 }) }).then(r => r.json()); setLab(l => [...out, ...l].slice(0, 60)); refresh(); }}>Minar 5 estrategias</button></div>
          {lab.slice(0, 15).map(s => <div key={s.id} className="row"><span>{s.name} · {s.status}{s.live ? ` · paper ${eur(s.live.pnl)}` : ""}{s.backtest ? ` · BT ${eur(s.backtest.total)} sh${s.backtest.sharpe}` : ""}</span><span>{s.status === "lista" ? <button className="btn primary" onClick={async () => { await fetch(`/api/incubator/${s.id}/promote`, { method: "POST" }); refresh(); }}>Dar capital</button> : s.status === "activa" || s.status === "incubacion" ? <button className="btn danger" onClick={async () => { await fetch(`/api/incubator/${s.id}/retire`, { method: "POST" }); refresh(); }}>Retirar</button> : <span>{s.discard?.slice(0, 24) || (s.robustness ? `rob ${s.robustness?.score}/4` : "")}</span>}</span></div>)}
          <h3 className="section">Setups · expectancy neta (aprenden de aquí)</h3>
          {setups.slice(0, 8).map(s => <div key={s.strategy} className="row"><span>{s.strategy}</span><span className={pcl(s.avg)}>{eur(s.avg)}/op · {s.win}% · n={s.trades}</span></div>)}
        </div></>}
        {tab === "Mesas" && <><div className="phead"><h3>MESAS · ARB / DERIVADOS / COBERTURA</h3></div><div className="pbody">
          <div className="statgrid">
            <div className="cell"><label>SPOT</label><b className={pcl(desks.pnl?.spot)}>{eur(desks.pnl?.spot)}</b></div>
            <div className="cell"><label>ARBITRAJE</label><b className={pcl(desks.pnl?.arbitraje)}>{eur(desks.pnl?.arbitraje)}</b></div>
            <div className="cell"><label>DERIVADOS</label><b className={pcl(desks.pnl?.derivados)}>{eur(desks.pnl?.derivados)}</b></div>
            <div className="cell"><label>COBERTURA</label><b className={pcl(desks.pnl?.cobertura)}>{eur(desks.pnl?.cobertura)}</b></div>
          </div>
          <div className="row"><span>Funding</span><span>{desks.funding}%</span></div>
          <div className="row"><span>Cobertura</span><span>{desks.hedge ? `SHORT BTC ${eur(desks.hedge.pnl)}` : `inactiva (${desks.signal || "-"})`}</span></div>
          <div className="row"><span>Arb abiertos / Deriv abiertos</span><span>{(desks.arbOpen || []).length} / {(desks.derivadosOpen || []).length}</span></div>
          {(desks.arbOpen || []).map((o: any) => <div key={o.id} className="row"><span>ARB {o.pair} spr {o.spreadOpen}%</span><span className={pcl(o.pnl)}>{eur(o.pnl)}</span></div>)}
          <h3 className="section">Spreads A↔B</h3>
          {(desks.venues || []).slice(0, 9).map((v: any) => <div key={v.pair}><div className="row"><span>{v.pair} · A {v.a} / B {v.b}</span><span>{v.spread}%</span></div><div className="bar"><i style={{ width: `${Math.min(100, Number(v.spread) * 120)}%` }} /></div></div>)}
        </div></>}
        {tab === "Riesgo" && (<><div className="phead"><h3>RIESGOS · LÍMITES DEL FONDO</h3></div><div className="pbody">
          <div className="row"><span>Pérdida día máx</span><span className={pcl(riskInfo.dayPnl)}>{eur(riskInfo.limits?.max_day_loss)} (ahora {eur(riskInfo.dayPnl)})</span></div>
          <div className="row"><span>Drawdown máx</span><span>{riskInfo.limits?.max_drawdown}% (ahora {riskInfo.drawdown}%)</span></div>
          <div className="row"><span>Exposición máx</span><span>{riskInfo.limits?.max_exposure_gross}% (ahora {riskInfo.exposure}%)</span></div>
          <div className="row"><span>Abiertas / Bloqueadas</span><span>{riskInfo.open} / {riskInfo.blocked}</span></div>
          <div className="row"><span>Suspendidos</span><span>{(riskInfo.suspended || []).length}</span></div>
          <div className="row"><span>Costes pagados</span><span>{eur(portfolio.costes_pagados)} (taker+spread real)</span></div>
          {report && <div className={`verdict ${report.verdict?.startsWith("consistente") ? "ok" : report.verdict?.startsWith("muestra") ? "warn" : "bad"}`}>Informe paper · {report.verdict}</div>}
          {report && (<>
            <div className="row"><span>Neto / Fees</span><span><b className={pcl(report.net)}>{eur(report.net)}</b> / {eur(report.fees_paid)} ({report.costs_drag})</span></div>
            <div className="row"><span>Trades cerrados/abiertos/bloq</span><span>{report.trades.closed}/{report.trades.open}/{report.trades.blocked} ({report.trades.block_rate})</span></div>
            <div className="row"><span>WR / PF / Sharpe</span><span>{report.win_rate} / {report.profit_factor} / {report.sharpe}</span></div>
            <div className="row"><span>Días verdes</span><span>{report.green_days} ({report.days} días)</span></div>
            <div className="row"><span>Neto por desk</span><span>{Object.entries(report.desk_net || {}).map(([k, v]) => `${k}:${v}€`).join(" ") || "-"}</span></div>
            {Object.entries(report.block_reasons || {}).slice(0, 4).map(([k, v]: any) => <div key={k} className="row"><span>Bloq: {k.slice(0, 40)}</span><span>×{v}</span></div>)}
          </>)}
          <h3 className="section">Comités ({meetings.length})</h3>
          {meetings.map(m => <div key={m.id} className="chatmsg"><div className="chatbody"><div className="chatmeta"><b>{m.topic}</b><time>{hhmm(m.ended_at)}</time></div><div className="chattext">Top: {(m.top3 || []).map((t: any) => t.name).join(", ")}<br />{(m.decisions || []).join(" · ")}</div></div></div>)}
        </div></>)}
      </div>
    </div>
  </>);
}
