import ccxt from "ccxt";
import { verifyToken, send } from "./_lib/auth.js";

// Fetch OHLCV server-side. The browser can't reach exchanges on a hosted URL
// (CORS), but the server can. Binance mainnet geoblocks some datacenter IPs,
// so we try the requested exchange first, then reliable US-reachable fallbacks.
export default async function handler(req, res) {
  if (!verifyToken(req)) return send(res, 401, { error: "Login required" });

  const requested = (req.query.exchange || "binance").toLowerCase();
  const symbol = req.query.symbol || "BTC/USDT";
  const timeframe = req.query.timeframe || "1m";
  const limit = Number(req.query.limit) || 600;

  const order = [];
  if (ccxt[requested]) order.push(requested);
  ["kraken", "kucoin", "okx", "bybit"].forEach(function (n) {
    if (n !== requested && ccxt[n]) order.push(n);
  });

  let lastErr = "no data source reachable";
  for (let i = 0; i < order.length; i++) {
    const name = order[i];
    try {
      const inst = new ccxt[name]({ enableRateLimit: true, timeout: 9000 });
      const ohlcv = await inst.fetchOHLCV(symbol, timeframe, undefined, limit);
      if (ohlcv && ohlcv.length >= 30) {
        return send(res, 200, {
          source: "LIVE",
          exchange: name,
          candles: ohlcv.map(function (k) {
            return { t: k[0], o: k[1], h: k[2], l: k[3], c: k[4], v: k[5] };
          }),
        });
      }
    } catch (e) {
      lastErr = String((e && e.message) || e);
    }
  }
  return send(res, 502, { error: lastErr });
}
