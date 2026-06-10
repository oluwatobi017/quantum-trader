import ccxt from "ccxt";
import { verifyToken, send } from "./_lib/auth.js";

export default async function handler(req, res) {
  if (!verifyToken(req)) return send(res, 401, { error: "Login required" });
  try {
    const exchange = (req.query.exchange || "binance").toLowerCase();
    const symbol = req.query.symbol || "BTC/USDT";
    const timeframe = req.query.timeframe || "1m";
    const limit = Number(req.query.limit) || 600;
    if (!ccxt[exchange]) return send(res, 400, { error: "Unsupported exchange" });
    const inst = new ccxt[exchange]({ enableRateLimit: true, timeout: 9000 });
    const ohlcv = await inst.fetchOHLCV(symbol, timeframe, undefined, limit);
    return send(res, 200, { source: "LIVE", exchange, candles: ohlcv.map(function(k){ return { t:k[0], o:k[1], h:k[2], l:k[3], c:k[4], v:k[5] }; }) });
  } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
}
