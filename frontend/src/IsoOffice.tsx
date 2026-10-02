import { useEffect, useRef } from "react";
import * as PIXI from "pixi.js";

// Oficina real: cada departamento es una zona con mesas en filas y cada agente
// es un muñequito sentado en su puesto. En modo comité todos se sientan
// alrededor de la mesa de reuniones.
const TW = 46, TH = 23;

function statusColor(s: string) {
  return s === "hablando" ? 0x4fc3f7 : s === "operando" ? 0x69f0ae : s === "analizando" ? 0xffd54f : s === "estudiando" ? 0xba68c8 : 0x78909c;
}
const DEPT_ACCENT: any = {
  trading: 0xd4ff3f, direccion: 0xffd54f, riesgos: 0xff6b6b, macro: 0x4fc3f7,
  analisis: 0x69f0ae, cartera: 0xba68c8, derivados: 0xf0a35e, arbitraje: 0x4fd8c7,
  quant: 0x8fa8ff, lab: 0xe08fff, escuela: 0x9be15d, bienestar: 0xff9ecb, infra: 0x78909c,
};
const SKIN = [0xf2c89b, 0xe0a878, 0xc98a5e, 0xa06a42, 0x7c4f2e, 0xf7d7b5];
const HAIR = [0x2b2118, 0x4a3220, 0x777777, 0xd9d9d9, 0x1a1a1a, 0x6b4a2a];
const SHIRTS = [0x3f6fb5, 0x4faf7d, 0xb0533f, 0x8a5fc0, 0x3fa7b5, 0xb5893f, 0x5d7bd5, 0x53b06a];

function hash(s: string) { let h = 0; const t = String(s || "?"); for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return h; }

export default function IsoOffice({ agents, departments, selectedId, onSelect, meeting }: any) {
  const host = useRef<HTMLDivElement>(null);
  const data = useRef({ agents, departments, selectedId, onSelect, meeting });
  data.current = { agents, departments, selectedId, onSelect, meeting };

  useEffect(() => {
    const el = host.current!;
    const app = new PIXI.Application({ width: Math.max(300, el.clientWidth), height: Math.max(300, el.clientHeight), backgroundColor: 0x0a0d09, antialias: true });
    el.appendChild(app.view as unknown as HTMLElement);
    const root = new PIXI.Container();
    app.stage.addChild(root);
    const sprites = new Map<string, { c: PIXI.Container; gx: number; gy: number; phase: number }>();

    // Reparte a los agentes en asientos: por departamento, o todos en la
    // mesa de comité cuando hay reunión. Devuelve gx,gy objetivo por agente.
    const computeSeats = () => {
      const meet = !!data.current.meeting;
      const out = new Map<string, { gx: number; gy: number }>();
      const agents: any[] = data.current.agents;
      if (meet) {
        const cx = 10, cy = 19.4, cols = 16, sp = 0.62;
        agents.forEach((a, i) => {
          const r = Math.floor(i / cols), c = i % cols;
          out.set(a.id, { gx: cx + (c - cols / 2 + 0.5) * sp, gy: cy + (r - 1.6) * sp * 0.9 });
        });
        return out;
      }
      const byDept = new Map<string, any[]>();
      agents.forEach(a => {
        const k = a.department_id || "d-trading";
        if (!byDept.has(k)) byDept.set(k, []);
        byDept.get(k)!.push(a);
      });
      data.current.departments.forEach((d: any, di: number) => {
        const list = byDept.get(d.id) || [];
        if (!list.length) return;
        const px = 2 + (di % 5) * 3.6, py = 1.5 + Math.floor(di / 5) * 5.2;
        const big = d.slug === "trading";
        const sp = big ? 0.52 : 0.62;
        const cols = Math.max(2, Math.ceil(Math.sqrt(list.length * (big ? 1.4 : 1.1))));
        list.forEach((a, i) => {
          const r = Math.floor(i / cols), c = i % cols;
          const rows = Math.ceil(list.length / cols);
          out.set(a.id, { gx: px + (c - cols / 2 + 0.5) * sp, gy: py + (r - rows / 2 + 0.5) * sp });
        });
      });
      return out;
    };

    // Dibuja un muñequito sentado (silla + cuerpo + cabeza + pelo) + mesa con monitor.
    const drawPerson = (c: PIXI.Container, a: any, acc: number) => {
      const h = hash(a.id);
      const col = statusColor(a.status);
      const skin = SKIN[h % SKIN.length], hair = HAIR[(h >> 3) % HAIR.length], shirt = SHIRTS[(h >> 5) % SHIRTS.length];
      // sombra iso en el suelo
      const sh = new PIXI.Graphics(); sh.beginFill(0x000000, 0.35); sh.drawEllipse(0, 8, 11, 5); sh.endFill();
      // silla
      const chair = new PIXI.Graphics(); chair.beginFill(0x232b22); chair.drawRoundedRect(-6, -3, 12, 11, 3); chair.endFill();
      chair.beginFill(0x2e382c); chair.drawRect(-6, -9, 12, 7); chair.endFill();
      // cuerpo (camisa)
      const body = new PIXI.Graphics(); body.beginFill(shirt); body.drawRoundedRect(-6.5, -11, 13, 12, 4); body.endFill();
      // brazos hacia la mesa
      const arm = new PIXI.Graphics(); arm.beginFill(shirt);
      arm.drawRoundedRect(-9, -6, 4, 7, 2); arm.endFill(); arm.drawRoundedRect(5, -6, 4, 7, 2); arm.endFill();
      const hands = new PIXI.Graphics(); hands.beginFill(skin); hands.drawCircle(-7, 1.5, 2); hands.endFill(); hands.drawCircle(7, 1.5, 2); hands.endFill();
      // cabeza + pelo
      const head = new PIXI.Graphics(); head.beginFill(skin); head.drawCircle(0, -15.5, 5.6); head.endFill();
      const hr = new PIXI.Graphics(); hr.beginFill(hair); hr.drawCircle(0, -16.8, 5.2); hr.endFill();
      const face = new PIXI.Graphics(); face.beginFill(skin); face.drawEllipse(0, -14.2, 4.4, 3.6); face.endFill();
      // mesa delante + monitor con pantalla según estado
      const desk = new PIXI.Graphics();
      desk.beginFill(0x4a3a26); desk.drawRoundedRect(-15, 2, 30, 5, 2); desk.endFill();
      desk.beginFill(0x6b5433); desk.drawRoundedRect(-15, 1, 30, 3, 1.5); desk.endFill();
      desk.beginFill(0x222222); desk.drawRect(-13, 5, 3, 5); desk.endFill(); desk.drawRect(10, 5, 3, 5); desk.endFill();
      const scr = new PIXI.Graphics();
      scr.beginFill(0x111111); scr.drawRoundedRect(-8, -7, 16, 11, 1.5); scr.endFill();
      scr.beginFill(col, 0.95); scr.drawRoundedRect(-7, -6, 14, 9, 1); scr.endFill();
      scr.beginFill(0x0b0f0a, 0.85);
      const up = (h % 2) === 0;
      scr.drawRect(-5, up ? 0 : -4, 3, up ? -4 : 4); scr.drawRect(-1, up ? -2 : -2, 3, up ? -2 : 2); scr.drawRect(3, up ? 1 : -5, 2, up ? -3 : 3);
      scr.endFill();
      scr.beginFill(0x333333); scr.drawRect(-1.5, 4, 3, 2); scr.endFill();
      // anillo de estado en el suelo
      const ring = new PIXI.Graphics(); ring.lineStyle(2.5, col, 0.95); ring.drawEllipse(0, 8, 13, 6); ring.endFill();
      // jefe de departamento: estrella dorada
      c.addChild(sh, chair, body, arm, hands, head, hr, face, desk, scr, ring);
      if (/cio|directora|risk manager|mentor|portfolio manager/i.test(a.role || "")) {
        const star = new PIXI.Text("★", { fill: acc, fontSize: 11, fontWeight: "bold" });
        star.position.set(8, -26); c.addChild(star);
      }
      return ring;
    };

    const drawFloor = () => {
      root.removeChildren();
      sprites.clear();
      const W = app.screen.width, H = app.screen.height;
      const cx = W / 2, cy = 46;
      const toScreen = (gx: number, gy: number) => ({ sx: cx + (gx - gy) * TW / 2, sy: cy + (gx + gy) * TH / 2 });
      const meet = !!data.current.meeting;
      const seats = computeSeats();

      // moqueta base de la oficina
      const base = new PIXI.Graphics(); base.beginFill(0x0d110c, 1);
      const corners = [toScreen(-1, -1), toScreen(23, -1), toScreen(23, 23), toScreen(-1, 23)];
      base.moveTo(corners[0].sx, corners[0].sy);
      corners.slice(1).forEach(p => base.lineTo(p.sx, p.sy));
      base.closePath(); base.endFill();
      root.addChild(base);

      // mesa de comité (ovalada con sillas) al sur
      const cr = toScreen(10, 19.4);
      const sala = new PIXI.Graphics();
      sala.lineStyle(2, meet ? 0xffd54f : 0x3a4d2a, meet ? 1 : 0.7);
      sala.beginFill(meet ? 0x2a230c : 0x141a10, 0.95);
      sala.drawEllipse(cr.sx, cr.sy, 190, 62); sala.endFill();
      const table = new PIXI.Graphics();
      table.beginFill(0x4a3a26); table.drawEllipse(cr.sx, cr.sy, 120, 38); table.endFill();
      table.beginFill(0x6b5433); table.drawEllipse(cr.sx, cr.sy - 2, 120, 36); table.endFill();
      root.addChild(sala, table);
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2;
        const px = cr.sx + Math.cos(ang) * 150, py = cr.sy + Math.sin(ang) * 48;
        const ch = new PIXI.Graphics(); ch.beginFill(0x232b22); ch.drawCircle(px, py, 7); ch.endFill();
        root.addChild(ch);
      }
      const t0 = new PIXI.Text(meet ? "● COMITÉ EN SALA" : "SALA DE JUNTAS", { fill: meet ? 0xffd54f : 0x8fa086, fontSize: 12, fontWeight: "bold" });
      t0.position.set(cr.sx - t0.width / 2, cr.sy + 66); root.addChild(t0);

      // zonas de departamento: alfombra + placa con nombre
      data.current.departments.forEach((d: any, di: number) => {
        const acc: number = DEPT_ACCENT[d.slug] ?? 0x8fa086;
        const px = 2 + (di % 5) * 3.6, py = 1.5 + Math.floor(di / 5) * 5.2;
        const p = toScreen(px, py);
        const big = d.slug === "trading";
        const w = big ? 7.2 : 3.6, h = big ? 7.6 : 4.0;
        const g = new PIXI.Graphics();
        g.lineStyle(big ? 2 : 1, acc, big ? 0.85 : 0.4);
        g.beginFill(big ? 0x16200e : 0x10140e, 1);
        g.moveTo(p.sx, p.sy - h * TH / 2); g.lineTo(p.sx + w * TW / 2, p.sy); g.lineTo(p.sx, p.sy + h * TH / 2); g.lineTo(p.sx - w * TW / 2, p.sy); g.closePath(); g.endFill();
        root.addChild(g);
        // placa
        const plate = new PIXI.Graphics();
        plate.beginFill(0x0a0d08, 0.92); plate.lineStyle(1, acc, 0.8);
        const label = `${d.name.toUpperCase()} · ${d.headcount || 0}`;
        plate.drawRoundedRect(p.sx - 78, p.sy - h * TH / 2 - 30, 156, 20, 5); plate.endFill();
        root.addChild(plate);
        const lt = new PIXI.Text(label, { fill: acc, fontSize: 10, fontWeight: "bold" });
        lt.position.set(p.sx - lt.width / 2, p.sy - h * TH / 2 - 26); root.addChild(lt);
        // plantita decorativa en la esquina
        const corner = toScreen(px + w / 2 - 0.4, py + h / 2 - 0.4);
        const pot = new PIXI.Graphics(); pot.beginFill(0x6b4a2a); pot.drawRoundedRect(corner.sx - 5, corner.sy - 2, 10, 8, 2); pot.endFill();
        pot.beginFill(0x2f7d3a); pot.drawCircle(corner.sx, corner.sy - 8, 7); pot.endFill();
        pot.beginFill(0x4ade80); pot.drawCircle(corner.sx - 2, corner.sy - 10, 3); pot.endFill();
        root.addChild(pot);
      });

      // muñequitos en sus asientos
      const order: any[] = [...data.current.agents].sort((x, y) => (x.y * 20 + x.x) - (y.y * 20 + y.x));
      order.forEach(a => {
        const seat = seats.get(a.id) || { gx: 10, gy: 10 };
        const { sx, sy } = toScreen(seat.gx, seat.gy);
        const dept = data.current.departments.find((d: any) => d.id === a.department_id);
        const acc: number = DEPT_ACCENT[dept?.slug] ?? 0x8fa086;
        const c = new PIXI.Container(); c.position.set(sx, sy);
        drawPerson(c, a, acc);
        if (data.current.selectedId === a.id) {
          const sel = new PIXI.Graphics(); sel.lineStyle(2.5, 0xd4ff3f, 1); sel.drawEllipse(0, 4, 19, 10); c.addChild(sel);
          const tag = new PIXI.Text(String(a.name).split("·")[0].slice(0, 20), { fill: 0xd4ff3f, fontSize: 10, fontWeight: "bold", stroke: 0x000000, strokeThickness: 3 });
          tag.position.set(-tag.width / 2, -40); c.addChild(tag);
        }
        c.eventMode = "static"; c.cursor = "pointer";
        c.on("pointerdown", () => data.current.onSelect(a.id));
        c.hitArea = new PIXI.Rectangle(-17, -34, 34, 48);
        root.addChild(c);
        sprites.set(a.id, { c, gx: seat.gx, gy: seat.gy, phase: (hash(a.id) % 100) / 100 * Math.PI * 2 });
      });
    };
    drawFloor();

    const tick = () => {
      const t = Date.now();
      const seats = computeSeats();
      const W = app.screen.width, cx = W / 2, cy = 46;
      for (const a of data.current.agents) {
        const s = sprites.get(a.id);
        const seat = seats.get(a.id);
        if (!s || !seat) continue;
        s.gx += (seat.gx - s.gx) * 0.08; s.gy += (seat.gy - s.gy) * 0.08;
        const sx = cx + (s.gx - s.gy) * TW / 2, sy = cy + (s.gx + s.gy) * TH / 2;
        const active = a.status === "hablando" || a.status === "operando";
        const bob = active ? Math.sin(t / 280 + s.phase) * 1.6 : Math.sin(t / 900 + s.phase) * 0.5;
        s.c.position.set(sx, sy + bob);
        s.c.alpha = active ? 0.9 + Math.sin(t / 220 + s.phase) * 0.1 : 1;
      }
    };
    app.ticker.add(tick);
    const iv = setInterval(drawFloor, 5000);
    const onR = () => app.renderer.resize(Math.max(300, el.clientWidth), Math.max(300, el.clientHeight));
    window.addEventListener("resize", onR);
    return () => { clearInterval(iv); window.removeEventListener("resize", onR); app.destroy(true); };
  }, []);

  return <div ref={host} style={{ width: "100%", height: "100%", minHeight: 420 }} />;
}
