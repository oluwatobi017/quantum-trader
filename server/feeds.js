/**
 * QUANTUM TRADER v6 — Derivatives & Microstructure Data Feeds
 *
 * Real exchange data NOT in v5:
 *   - Funding rate        (perp funding — sentiment/crowding signal)
 *   - Open interest        (positioning — is leverage building or unwinding?)
 *   - Orderbook depth      (real bid/ask imbalance, not candle approximation)
 *   - Liquidations         (recent liquidation pressure)
 *
 * Uses CCXT where it has a unified method; falls back gracefully when an
 * exchange/endpoint doesn't support a feed. Never fabricates values.
 */
import ccxt from "ccxt";

function makePublic(exName) {
  const ex = exName.toLowerCase();
  if (!ccxt[ex]) throw new Error("Unsupported exchange: " + exName);
  return new ccxt[ex]({ enableRateLimit: true, timeout: 9000, options: { defaultType: "swap" } });
}

// ── FUNDING RATE ─────────────────────────────────────────────────────────────
export async function getFundingRate(exName, symbol) {
  const ex = makePublic(exName);
  if (!ex.has["fetchFundingRate"]) return { supported: false };
  const f = await ex.fetchFundingRate(symbol);
  return {
    supported: true,
    rate: f.fundingRate,                 // e.g. 0.0001 = 0.01%
    pct: f.fundingRate != null ? +(f.fundingRate * 100).toFixed(4) : null,
    nextTime: f.nextFundingTimestamp || f.fundingTimestamp || null,
    mark: f.markPrice, index: f.indexPrice,
  };
}

// ── OPEN INTEREST ────────────────────────────────────────────────────────────
export async function getOpenInterest(exName, symbol) {
  const ex = makePublic(exName);
  if (!ex.has["fetchOpenInterest"]) return { supported: false };
  const oi = await ex.fetchOpenInterest(symbol);
  return {
    supported: true,
    openInterest: oi.openInterestAmount ?? oi.openInterestValue ?? null,
    value: oi.openInterestValue ?? null,
    ts: oi.timestamp || Date.now(),
  };
}

// ── ORDERBOOK DEPTH + IMBALANCE ──────────────────────────────────────────────
// Real bid/ask imbalance over the top N levels — feeds the order-flow engine.
export async function getOrderbook(exName, symbol, depth = 25) {
  const ex = makePublic(exName);
  const ob = await ex.fetchOrderBook(symbol, depth);
  const bids = (ob.bids || []).slice(0, depth);
  const asks = (ob.asks || []).slice(0, depth);
  const bidVol = bids.reduce((s, b) => s + (b[1] || 0), 0);
  const askVol = asks.reduce((s, a) => s + (a[1] || 0), 0);
  const total = bidVol + askVol;
  const imbalance = total > 0 ? +(((bidVol - askVol) / total) * 100).toFixed(2) : 0; // -100..+100
  const bestBid = bids[0] ? bids[0][0] : null;
  const bestAsk = asks[0] ? asks[0][0] : null;
  const spread = bestBid && bestAsk ? +(bestAsk - bestBid).toFixed(8) : null;
  // Largest resting orders = potential whale walls
  const topBid = bids.reduce((m, b) => (b[1] > (m.size||0) ? { px:b[0], size:b[1] } : m), {});
  const topAsk = asks.reduce((m, a) => (a[1] > (m.size||0) ? { px:a[0], size:a[1] } : m), {});
  return {
    supported: true, bidVol: +bidVol.toFixed(4), askVol: +askVol.toFixed(4),
    imbalance, bestBid, bestAsk, spread, topBid, topAsk,
    bias: imbalance > 15 ? "BUY_PRESSURE" : imbalance < -15 ? "SELL_PRESSURE" : "BALANCED",
  };
}

// ── RECENT LIQUIDATIONS ──────────────────────────────────────────────────────
// Not all exchanges expose this via CCXT; return supported:false when absent.
export async function getLiquidations(exName, symbol) {
  const ex = makePublic(exName);
  if (!ex.has["fetchLiquidations"]) return { supported: false };
  try {
    const liqs = await ex.fetchLiquidations(symbol, undefined, 50);
    let longLiq = 0, shortLiq = 0;
    liqs.forEach(l => {
      const notional = (l.price || 0) * (l.amount || 0);
      if (l.side === "sell") longLiq += notional;   // longs getting liquidated = sells
      else shortLiq += notional;
    });
    return {
      supported: true, count: liqs.length,
      longLiquidated: +longLiq.toFixed(2), shortLiquidated: +shortLiq.toFixed(2),
      pressure: longLiq > shortLiq ? "LONGS_FLUSHED" : shortLiq > longLiq ? "SHORTS_FLUSHED" : "NEUTRAL",
    };
  } catch (_) { return { supported: false }; }
}

// ── COMBINED SNAPSHOT ────────────────────────────────────────────────────────
export async function getMicrostructure(exName, symbol) {
  const safe = async (fn) => { try { return await fn(); } catch (e) { return { supported: false, error: String(e.message || e) }; } };
  const [funding, oi, ob, liq] = await Promise.all([
    safe(() => getFundingRate(exName, symbol)),
    safe(() => getOpenInterest(exName, symbol)),
    safe(() => getOrderbook(exName, symbol, 25)),
    safe(() => getLiquidations(exName, symbol)),
  ]);
  return { exchange: exName, symbol, ts: Date.now(), funding, openInterest: oi, orderbook: ob, liquidations: liq };
}
