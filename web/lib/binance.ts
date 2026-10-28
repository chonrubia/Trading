// Cliente Binance (solo datos públicos). Sin claves, sin estado, fetch inyectable.
// Precios en EUR: los 12 pares tienen par spot EUR real en Binance, así la
// contabilidad del fondo (60 €) no arrastra riesgo FX artificial.
export type Pair =
  | "BTC" | "ETH" | "SOL" | "XRP" | "BNB" | "DOGE"
  | "ADA" | "AVAX" | "LINK" | "NEAR" | "TRX" | "LTC";

export const PAIRS: Pair[] = ["BTC", "ETH", "SOL", "XRP", "BNB", "DOGE", "ADA", "AVAX", "LINK", "NEAR", "TRX", "LTC"];

export const SYMBOLS: Record<Pair, string> = {
  BTC: "BTCEUR", ETH: "ETHEUR", SOL: "SOLEUR", XRP: "XRPEUR",
  BNB: "BNBEUR", DOGE: "DOGEEUR", ADA: "ADAEUR", AVAX: "AVAXEUR",
  LINK: "LINKEUR", NEAR: "NEAREUR", TRX: "TRXEUR", LTC: "LTCEUR",
};
export const SYMBOL_TO_PAIR: Record<string, Pair> = Object.fromEntries(
  (Object.entries(SYMBOLS) as Array<[Pair, string]>).map(([p, s]) => [s, p])
);

export type Interval = "15m" | "1h" | "4h" | "1d";
export const INTERVALS: Interval[] = ["15m", "1h", "4h", "1d"];
export const INTERVAL_MS: Record<Interval, number> = {
  "15m": 15 * 60_000, "1h": 60 * 60_000, "4h": 4 * 60 * 60_000, "1d": 24 * 60 * 60_000,
};

export const BINANCE_BASE = "https://data-api.binance.vision";
export const FAPI_BASE = "https://fapi.binance.com";
export type FetchImpl = (input: string, init?: any) => Promise<any>;

export interface Candle {
  openTime: number; open: number; high: number; low: number; close: number;
  volume: number; closeTime: number; trades: number;
}

export interface Ticker {
  symbol: string; pair: Pair; price: number; changePct: number;
  high: number; low: number; quoteVolume: number; closeTime: number;
}

export class BinanceError extends Error {
  constructor(message: string, public status = 0) { super(message); this.name = "BinanceError"; }
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
};

/** Parsea el array crudo de /api/v3/klines. Ignora filas corruptas. */
export function parseKlines(raw: unknown): Candle[] {
  if (!Array.isArray(raw)) return [];
  const out: Candle[] = [];
  for (const row of raw) {
    if (!Array.isArray(row) || row.length < 7) continue;
    const c: Candle = {
      openTime: num(row[0]), open: num(row[1]), high: num(row[2]), low: num(row[3]),
      close: num(row[4]), volume: num(row[5]), closeTime: num(row[6]), trades: num(row[8]) || 0,
    };
    if (![c.openTime, c.open, c.high, c.low, c.close, c.volume, c.closeTime].every(Number.isFinite)) continue;
    if (c.high < c.low || c.open <= 0 || c.close <= 0) continue;
    out.push(c);
  }
  return out.sort((a, b) => a.openTime - b.openTime);
}

/** Solo velas cerradas: la última vela de Binance suele estar en curso. */
export function closedKlines(candles: Candle[], nowMs: number): Candle[] {
  return candles.filter(c => c.closeTime < nowMs);
}

/** Agrupa velas en intervalos mayores (4×15m→1h, 16×15m→4h, 24×1h→1d). */
export function aggregate(candles: Candle[], factor: number): Candle[] {
  if (factor <= 1) return candles.slice();
  const out: Candle[] = [];
  let bucket: Candle[] = [];
  let start = -1;
  const push = () => {
    if (!bucket.length) return;
    const first = bucket[0], last = bucket[bucket.length - 1];
    out.push({
      openTime: first.openTime, open: first.open,
      high: Math.max(...bucket.map(c => c.high)),
      low: Math.min(...bucket.map(c => c.low)),
      close: last.close,
      volume: bucket.reduce((s, c) => s + c.volume, 0),
      closeTime: last.closeTime,
      trades: bucket.reduce((s, c) => s + c.trades, 0),
    });
  };
  for (const c of candles) {
    const b = Math.floor(c.openTime / (INTERVAL_MS["15m"] * factor));
    if (start === -1) start = b;
    if (b !== start) { push(); bucket = []; start = b; }
    bucket.push(c);
  }
  push();
  return out;
}

export function parseTicker(raw: any): Ticker | null {
  if (!raw || typeof raw !== "object") return null;
  const pair = SYMBOL_TO_PAIR[String(raw.symbol)];
  if (!pair) return null;
  const t: Ticker = {
    symbol: String(raw.symbol), pair,
    price: num(raw.lastPrice), changePct: num(raw.priceChangePercent),
    high: num(raw.highPrice), low: num(raw.lowPrice),
    quoteVolume: num(raw.quoteVolume), closeTime: num(raw.closeTime),
  };
  return [t.price, t.changePct, t.high, t.low, t.quoteVolume, t.closeTime].every(Number.isFinite) && t.price > 0 ? t : null;
}

export function parseTickers(raw: unknown): Record<string, Ticker> {
  const list = Array.isArray(raw) ? raw : [raw];
  const out: Record<string, Ticker> = {};
  for (const r of list) { const t = parseTicker(r); if (t) out[t.pair] = t; }
  return out;
}

/** Frescura: si el ticker más viejo supera maxAge, todo el mercado está stale. */
export function staleness(tickers: Record<string, Ticker>, nowMs: number, maxAgeMs = 15 * 60_000): {
  stale: boolean; ageMs: number; newest: number; oldest: number;
} {
  const times = Object.values(tickers).map(t => t.closeTime).filter(Number.isFinite);
  if (!times.length) return { stale: true, ageMs: Infinity, newest: 0, oldest: 0 };
  const newest = Math.max(...times), oldest = Math.min(...times);
  const ageMs = Math.max(0, nowMs - oldest);
  return { stale: ageMs > maxAgeMs || nowMs - newest > maxAgeMs, ageMs, newest, oldest };
}

async function getJson(url: string, f: FetchImpl, timeoutMs = 10_000): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await f(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!res || typeof res.ok !== "boolean") throw new BinanceError(`respuesta inválida de Binance: ${url}`, 0);
    if (!res.ok) throw new BinanceError(`Binance HTTP ${res.status}: ${url}`, res.status);
    return await res.json();
  } catch (e: any) {
    if (e instanceof BinanceError) throw e;
    throw new BinanceError(`Binance no responde (${e?.name === "AbortError" ? "timeout" : e?.message || e}): ${url}`);
  } finally { clearTimeout(timer); }
}

export async function fetchKlines(symbol: string, interval: Interval, limit = 500, f: FetchImpl = fetch): Promise<Candle[]> {
  const n = Math.min(1000, Math.max(1, Math.floor(limit)));
  const raw = await getJson(`${BINANCE_BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${n}`, f);
  return parseKlines(raw);
}

/**
 * Histórico paginado hacia atrás (máx. 12 peticiones). Solo para backtest:
 * pide `total` velas y devuelve las más recientes en orden ascendente.
 */
export async function fetchKlinesHistory(symbol: string, interval: Interval, total: number, f: FetchImpl = fetch): Promise<Candle[]> {
  const want = Math.min(12_000, Math.max(1, Math.floor(total)));
  const all: Candle[] = [];
  let endTime: number | undefined;
  for (let i = 0; i < 12 && all.length < want; i++) {
    const need = Math.min(1000, want - all.length);
    const q = `${BINANCE_BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${need}` +
      (endTime ? `&endTime=${endTime}` : "");
    const batch = parseKlines(await getJson(q, f));
    if (!batch.length) break;
    all.unshift(...batch);
    endTime = batch[0].openTime - 1;
    if (batch.length < need) break;
  }
  const seen = new Set<number>();
  return all.filter(c => (seen.has(c.openTime) ? false : (seen.add(c.openTime), true)))
    .sort((a, b) => a.openTime - b.openTime).slice(-want);
}

export async function fetchTickers(f: FetchImpl = fetch): Promise<Record<string, Ticker>> {
  const symbols = encodeURIComponent(JSON.stringify(PAIRS.map(p => SYMBOLS[p])));
  const raw = await getJson(`${BINANCE_BASE}/api/v3/ticker/24hr?symbols=${symbols}`, f);
  const out = parseTickers(raw);
  const missing = PAIRS.filter(p => !out[p]);
  if (missing.length) throw new BinanceError(`tickers incompletos: faltan ${missing.join(",")}`);
  return out;
}

/** Funding informativo (futuros). En spot no se paga; nunca bloquea el tick. */
export async function fetchFunding(f: FetchImpl = fetch): Promise<number> {
  try {
    const raw = await getJson(`${FAPI_BASE}/fapi/v1/premiumIndex?symbol=BTCUSDT`, f, 6000);
    const r = num(raw?.lastFundingRate);
    return Number.isFinite(r) ? Math.round(r * 100 * 10000) / 10000 : 0;
  } catch { return 0; }
}

/** Fear & Greed externo, best-effort. Nunca bloquea el tick. */
export async function fetchFearGreed(f: FetchImpl = fetch): Promise<number> {
  try {
    const raw = await getJson("https://api.alternative.me/fng/?limit=1", f, 6000);
    const v = num(raw?.data?.[0]?.value);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
  } catch { return 50; }
}
