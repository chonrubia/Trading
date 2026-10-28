// Contabilidad spot 1x, sin apalancamiento y sin PnL inexplicado.
// Dinero en EUR. Comisión taker real por lado + medio spread + slippage.
// Identidad que los tests congelan: equity = cash + valor de mercado;
// realized = base + suma(PnL cerrado); unrealized = equity - realized.
import { HALF_SPREAD, SLIP, SPOT_TAKER } from "./costs.js";

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export const round8 = (n: number): number => Math.round((n + Number.EPSILON) * 1e8) / 1e8;

export interface Account {
  base: number;
  cash: number;
  realized: number;
  feesPaid: number;
  trades: number;
  wins: number;
  grossProfit: number;
  grossLoss: number;
}

export interface Position {
  id: string;
  agent_id: string;
  agent_name: string;
  strategy: string;
  pair: string;
  side: "LONG";
  qty: number;
  /** Precio medio de la señal (referencia). */
  entry: number;
  /** Precio real de ejecución con medio spread + slippage. */
  entry_fill: number;
  entry_fee: number;
  cost: number;
  notional: number;
  opened_at: string;
  stop: number;
  target: number;
  maxLife: number;
  life: number;
  pnl: number;
  pnl_pct: number;
  mfe: number;
  status: "abierta";
  desk: "spot";
}

export interface ClosedTrade extends Omit<Position, "status"> {
  status: "cerrada";
  exit: number;
  exit_fill: number;
  exit_fee: number;
  fees: number;
  closed_at: string;
  close_reason: string;
}

export function newAccount(base: number): Account {
  return { base, cash: base, realized: base, feesPaid: 0, trades: 0, wins: 0, grossProfit: 0, grossLoss: 0 };
}

export function halfSpread(pair: string): number { return HALF_SPREAD[pair] ?? 0.0004; }
export function feeRate(): number { return SPOT_TAKER; }

/** Precio de ejecución a mercado: comprar paga spread+slippage, vender los recibe. */
export function fillPrice(pair: string, mid: number, side: "BUY" | "SELL"): number {
  const cost = halfSpread(pair) + SLIP;
  return round8(side === "BUY" ? mid * (1 + cost) : mid * (1 - cost));
}

export function feeOf(notional: number): number { return round2(notional * SPOT_TAKER); }

export interface OpenRequest {
  id: string; agent_id: string; agent_name: string; strategy: string;
  pair: string; mid: number; notional: number; stop: number; target: number;
  maxLife: number; opened_at: string;
}

export function openPosition(account: Account, req: OpenRequest): { account: Account; position: Position } {
  if (!(req.mid > 0)) throw new Error("precio de entrada inválido");
  if (!(req.notional > 0)) throw new Error("nocional inválido");
  const fill = fillPrice(req.pair, req.mid, "BUY");
  const qty = round8(req.notional / fill);
  const cost = round2(qty * fill);
  const entryFee = feeOf(cost);
  if (cost + entryFee > account.cash + 0.005) throw new Error(`cash insuficiente: ${account.cash}€ para ${cost + entryFee}€`);
  const position: Position = {
    id: req.id, agent_id: req.agent_id, agent_name: req.agent_name, strategy: req.strategy,
    pair: req.pair, side: "LONG", qty, entry: req.mid, entry_fill: fill,
    entry_fee: entryFee, cost, notional: cost,
    opened_at: req.opened_at, stop: req.stop, target: req.target,
    maxLife: req.maxLife, life: 0, pnl: -entryFee, pnl_pct: 0, mfe: 0,
    status: "abierta", desk: "spot",
  };
  return {
    account: {
      ...account,
      cash: round2(account.cash - cost - entryFee),
      feesPaid: round2(account.feesPaid + entryFee),
    },
    position,
  };
}

export function closePosition(account: Account, position: Position, mid: number, reason: string, ts: string): { account: Account; trade: ClosedTrade } {
  if (!(mid > 0)) throw new Error("precio de salida inválido");
  const fill = fillPrice(position.pair, mid, "SELL");
  const gross = round2(position.qty * fill);
  const exitFee = feeOf(gross);
  const proceeds = round2(gross - exitFee);
  const pnl = round2(proceeds - position.cost - position.entry_fee);
  const trade: ClosedTrade = {
    ...position, status: "cerrada", exit: mid, exit_fill: fill,
    exit_fee: exitFee, fees: round2(position.entry_fee + exitFee),
    pnl, pnl_pct: position.cost ? Math.round((pnl / position.cost) * 10000) / 100 : 0,
    closed_at: ts, close_reason: reason,
  };
  return {
    account: {
      ...account,
      cash: round2(account.cash + proceeds),
      realized: round2(account.realized + pnl),
      feesPaid: round2(account.feesPaid + exitFee),
      trades: account.trades + 1,
      wins: account.wins + (pnl > 0 ? 1 : 0),
      grossProfit: round2(account.grossProfit + (pnl > 0 ? pnl : 0)),
      grossLoss: round2(account.grossLoss + (pnl < 0 ? -pnl : 0)),
    },
    trade,
  };
}

export function markPosition(p: Position, mid: number): Position {
  const value = p.qty * mid;
  const pnl = round2(value - p.cost - p.entry_fee);
  const pnlPct = p.cost ? Math.round((pnl / p.cost) * 10000) / 100 : 0;
  return { ...p, pnl, pnl_pct: pnlPct, mfe: Math.max(p.mfe, pnlPct) };
}

export interface Summary {
  cash: number; positionsValue: number; equity: number;
  realized: number; unrealized: number; feesPaid: number;
  exposurePct: number; invested: number; base: number;
  trades: number; wins: number; winRate: number; profitFactor: number;
}

export function summarize(account: Account, positions: Position[], prices: Record<string, number>): Summary {
  const positionsValue = round2(positions.reduce((s, p) => s + p.qty * (prices[p.pair] || p.entry), 0));
  const equity = round2(account.cash + positionsValue);
  const invested = round2(positions.reduce((s, p) => s + p.cost, 0));
  return {
    cash: account.cash, positionsValue, equity,
    realized: account.realized, unrealized: round2(equity - account.realized),
    feesPaid: account.feesPaid, exposurePct: equity ? Math.round((positionsValue / equity) * 10000) / 100 : 0,
    invested, base: account.base,
    trades: account.trades, wins: account.wins,
    winRate: account.trades ? Math.round((account.wins / account.trades) * 1000) / 10 : 0,
    profitFactor: account.grossLoss > 0 ? Math.round((account.grossProfit / account.grossLoss) * 100) / 100 : account.grossProfit > 0 ? 99 : 0,
  };
}
