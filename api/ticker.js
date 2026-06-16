import ccxt from "ccxt";
import { verifyToken, send } from "./_lib/auth.js";

// Server-side ticker with fallback exchanges. The browser can't reach
// exchanges on a hosted URL (CORS); the server can. If the requested
// exchange is geoblocked or down, fall back to reliable alternatives so the
// price feed (and therefore the candles + bot) never silently freezes.
export default async function handler(req, res) {
  if (!verifyToken(req)) return send(res, 401, { error: "Login required" });
  const requested = (req.query.exchange || "binance").toLowerCase();
  const symbol = req.query.symbol || "BTC/USDT";
  const order = [];
  if (ccxt[requested]) order.push(requested);
  ["kraken", "kucoin", "okx", "bybit"].forEach(function (n) {
    if (n !== requested && ccxt[n]) order.push(n);
  });
  let lastErr = "no ticker source reachable";
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    try {
      const inst = new ccxt[name]({ enableRateLimit: true, timeout: 8000 });
      const t = await inst.fetchTicker(symbol);
      const mid = ((t.bid + t.ask) / 2) || t.last;
      if (isFinite(mid)) {
        return send(res, 200, { exchange: name, bid: t.bid, ask: t.ask, mid: mid, spread: (t.ask - t.bid) || 0, last: t.last });
      }
    } catch (e) { lastErr = String((e && e.message) || e); }
  }
  return send(res, 502, { error: lastErr });
}
