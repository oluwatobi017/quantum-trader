import ccxt from "ccxt";
import { verifyToken, send } from "./_lib/auth.js";
export default async function handler(req, res) {
  if (!verifyToken(req)) return send(res, 401, { error: "Login required" });
  try {
    const exchange = (req.query.exchange || "binance").toLowerCase();
    const symbol = req.query.symbol || "BTC/USDT";
    const inst = new ccxt[exchange]({ enableRateLimit: true, timeout: 8000 });
    const t = await inst.fetchTicker(symbol);
    const mid = (t.bid + t.ask) / 2 || t.last;
    return send(res, 200, { bid: t.bid, ask: t.ask, mid, spread: (t.ask - t.bid) || 0, last: t.last });
  } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
}
