// Costura de ejecución. El motor usa contabilidad pura; este módulo define el
// contrato de broker y el adaptador live de Binance spot, desactivado por defecto.
// Ninguna orden real sale sin LIVE_TRADING_ENABLED=true + armado explícito.
import { createHmac } from "node:crypto";
import { fillPrice, feeOf, round8 } from "./accounting.js";
import { SYMBOLS, type FetchImpl } from "./binance.js";

export interface BrokerOrder {
  pair: string;
  notional?: number;   // compra: gastar X EUR
  qty?: number;        // venta: vender X unidades
  price: number;       // referencia para paper
}

export interface BrokerFill {
  orderId: string;
  pair: string;
  side: "BUY" | "SELL";
  price: number;
  qty: number;
  notional: number;
  fee: number;
  feeAsset: string;
  ts: string;
  raw?: unknown;
}

export interface Broker {
  readonly mode: "paper" | "live";
  buy(order: BrokerOrder): Promise<BrokerFill>;
  sell(order: BrokerOrder): Promise<BrokerFill>;
}

/** Broker paper: mismo modelo de costes que accounting (spread+slippage+taker). */
export class PaperBroker implements Broker {
  readonly mode = "paper" as const;
  private seq = 0;
  constructor(private now: () => number = Date.now) {}
  async buy(o: BrokerOrder): Promise<BrokerFill> {
    const px = fillPrice(o.pair, o.price, "BUY");
    const qty = round8((o.notional || 0) / px);
    return this.fill(o, "BUY", px, qty);
  }
  async sell(o: BrokerOrder): Promise<BrokerFill> {
    const px = fillPrice(o.pair, o.price, "SELL");
    const qty = round8(o.qty || 0);
    return this.fill(o, "SELL", px, qty);
  }
  private fill(o: BrokerOrder, side: "BUY" | "SELL", price: number, qty: number): BrokerFill {
    const notional = Math.round(qty * price * 100) / 100;
    return {
      orderId: `paper-${this.now()}-${++this.seq}`, pair: o.pair, side, price,
      qty, notional, fee: feeOf(notional), feeAsset: "EUR",
      ts: new Date(this.now()).toISOString(),
    };
  }
}

export interface LiveConfig {
  enabled: boolean;
  armed: boolean;
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  fetchImpl?: FetchImpl;
  now?: () => number;
}

export class LiveTradingDisabledError extends Error {
  constructor(message: string) { super(message); this.name = "LiveTradingDisabledError"; }
}

/**
 * Adaptador Binance spot. Está implementado pero apagado: cualquier llamada sin
 * enabled+armed lanza antes de tocar la red. Solo órdenes MARKET spot.
 */
export class BinanceSpotBroker implements Broker {
  readonly mode = "live" as const;
  private seq = 0;
  constructor(private cfg: LiveConfig) {}

  private guard() {
    if (!this.cfg.enabled) throw new LiveTradingDisabledError("LIVE_TRADING_ENABLED no está activo");
    if (!this.cfg.armed) throw new LiveTradingDisabledError("live no armado: falta POST /api/live/arm");
    if (!this.cfg.apiKey || !this.cfg.apiSecret) throw new LiveTradingDisabledError("faltan BINANCE_API_KEY / BINANCE_API_SECRET");
  }

  async buy(o: BrokerOrder): Promise<BrokerFill> {
    this.guard();
    if (!(o.notional && o.notional >= 5)) throw new Error("orden mínima 5€");
    return this.order(o, "BUY", { quoteOrderQty: o.notional.toFixed(2) });
  }

  async sell(o: BrokerOrder): Promise<BrokerFill> {
    this.guard();
    if (!(o.qty && o.qty > 0)) throw new Error("cantidad de venta inválida");
    return this.order(o, "SELL", { quantity: o.qty.toFixed(8) });
  }

  private async order(o: BrokerOrder, side: "BUY" | "SELL", extra: Record<string, string>): Promise<BrokerFill> {
    const symbol = SYMBOLS[o.pair as keyof typeof SYMBOLS];
    if (!symbol) throw new Error(`par sin símbolo Binance: ${o.pair}`);
    const params: Record<string, string> = {
      symbol, side, type: "MARKET", newOrderRespType: "FULL", ...extra,
      timestamp: String((this.cfg.now || Date.now)()), recvWindow: "5000",
    };
    const qs = new URLSearchParams(params).toString();
    const sig = createHmac("sha256", this.cfg.apiSecret as string).update(qs).digest("hex");
    const f = this.cfg.fetchImpl || (fetch as FetchImpl);
    const res = await f(`${this.cfg.baseUrl || "https://api.binance.com"}/api/v3/order?${qs}&signature=${sig}`, {
      method: "POST", headers: { "X-MBX-APIKEY": this.cfg.apiKey as string, "content-type": "application/x-www-form-urlencoded" },
    });
    if (!res.ok) throw new Error(`Binance order HTTP ${res.status}`);
    const raw = await res.json();
    const executedQty = Number(raw?.executedQty || 0);
    const quote = Number(raw?.cummulativeQuoteQty || 0);
    const price = executedQty > 0 ? quote / executedQty : o.price;
    const fee = Array.isArray(raw?.fills)
      ? raw.fills.reduce((s: number, x: any) => s + Number(x.commission || 0), 0)
      : Number(raw?.fills?.[0]?.commission || 0);
    const feeAsset = raw?.fills?.[0]?.commissionAsset || "EUR";
    return {
      orderId: String(raw?.orderId || `live-${Date.now()}-${++this.seq}`), pair: o.pair, side,
      price, qty: executedQty, notional: Math.round(quote * 100) / 100,
      fee: Math.round(fee * 1e8) / 1e8, feeAsset,
      ts: new Date().toISOString(), raw,
    };
  }
}
