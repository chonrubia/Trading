import { getKv, json } from "../../../lib/kv.js";
import { repo, ensureSeed } from "../../../lib/state.js";
import { deskPnl } from "../../../lib/desks.js";
import { SPOT_TAKER, FUT_TAKER, SLIP } from "../../../lib/costs.js";

export async function GET() {
  const kv = getKv();
  await ensureSeed(kv, new Date().toISOString());
  const [closed, openMap, blocked, snapshots, days] = await Promise.all([
    repo.closedOps(kv, 300), repo.openOps(kv), repo.blockedOps(kv, 100),
    repo.snapshots(kv, 500), repo.targetDays(kv),
  ]);
  const open = Object.values(openMap);
  const net = closed.reduce((s: number, o: any) => s + (o.pnl || 0), 0);
  const fees = closed.reduce((s: number, o: any) => s + (o.fees || 0), 0);
  const wins = closed.filter((o: any) => o.pnl > 0);
  const gp = wins.reduce((s: number, o: any) => s + o.pnl, 0);
  const gl = Math.abs(closed.filter((o: any) => o.pnl <= 0).reduce((s: number, o: any) => s + o.pnl, 0));
  const reasons: Record<string, number> = {};
  blocked.forEach((o: any) => { const k = (o.risk_note || "?").slice(0, 60); reasons[k] = (reasons[k] || 0) + 1; });
  const deskNet: Record<string, number> = {};
  closed.forEach((o: any) => { const k = o.desk || "spot"; deskNet[k] = Math.round(((deskNet[k] || 0) + o.pnl) * 100) / 100; });
  const approved = closed.length + open.length;
  return json({
    generated_at: new Date().toISOString(),
    costs_cfg: { spot_taker: SPOT_TAKER, fut_taker: FUT_TAKER, slip: SLIP, nota: "todo taker a mercado" },
    trades: {
      closed: closed.length, open: open.length, blocked: blocked.length,
      block_rate: approved + blocked.length ? Math.round((blocked.length / (approved + blocked.length)) * 1000) / 10 + "%" : "0%",
    },
    net: Math.round(net * 100) / 100, fees_paid: Math.round(fees * 100) / 100,
    costs_drag: gp ? Math.round((fees / gp) * 1000) / 10 + "% de las ganancias brutas" : "-",
    win_rate: closed.length ? Math.round((wins.length / closed.length) * 1000) / 10 + "%" : "-",
    profit_factor: Math.round((gp / (gl || 1)) * 100) / 100, sharpe: 0,
    days: Object.keys(days).length, green_days: "-",
    desk_net: deskNet, block_reasons: reasons,
    audit_tail: (await repo.audit(kv, 5)).map((a: any) => a.ev),
    verdict: closed.length < 20 ? "muestra insuficiente (faltan trades)" : gp / (gl || 1) > 1.2 ? "consistente (provisional)" : "no consistente",
  });
}
