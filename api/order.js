import ccxt from "ccxt";
import { verifyToken, ownerGateOK, send } from "./_lib/auth.js";

function ownerExchange(name) {
  const ex = (name || "binance").toLowerCase();
  const up = ex.toUpperCase();
  const key = process.env[up + "_TESTNET_KEY"] || "";
  const secret = process.env[up + "_TESTNET_SECRET"] || "";
  const pass = process.env[up + "_PASSPHRASE"] || undefined;
  const inst = new ccxt[ex]({ apiKey: key, secret, password: pass, enableRateLimit: true, options: { defaultType: "spot" } });
  if (typeof inst.setSandboxMode === "function") { try { inst.setSandboxMode(true); } catch (_) {} }
  return { inst, hasKeys: Boolean(key && secret) };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  if (!verifyToken(req)) return send(res, 401, { error: "Login required" });
  if (!ownerGateOK(req)) return send(res, 403, { error: "Owner gate required" });
  // This public deploy is PAPER/TESTNET ONLY by design — never live.
  const { exchange = "binance", symbol, side, amount, type = "market" } = req.body || {};
  if (!symbol || !side || !amount) return send(res, 400, { error: "symbol, side, amount required" });
  try {
    const { inst, hasKeys } = ownerExchange(exchange);
    if (!hasKeys) return send(res, 400, { error: "Owner testnet keys not configured" });
    const order = await inst.createOrder(symbol, type, side, Number(amount));
    return send(res, 200, { ok: true, mode: "paper", id: order.id, status: order.status,
      fillPrice: order.average || order.price || null, filled: order.filled });
  } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
}
