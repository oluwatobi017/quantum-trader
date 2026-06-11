import ccxt from "ccxt";
import { isOwner, send } from "./_lib/auth.js";

function ownerExchange(name) {
  const ex = (name || "binance").toLowerCase();
  const up = ex.toUpperCase();
  // Owner's testnet keys from Vercel env (e.g. BINANCE_TESTNET_KEY)
  const key = process.env[up + "_TESTNET_KEY"] || "";
  const secret = process.env[up + "_TESTNET_SECRET"] || "";
  const pass = process.env[up + "_PASSPHRASE"] || undefined;
  if (!ccxt[ex]) throw new Error("Unsupported exchange");
  const inst = new ccxt[ex]({ apiKey: key, secret, password: pass, enableRateLimit: true, options: { defaultType: "spot" } });
  if (typeof inst.setSandboxMode === "function") { try { inst.setSandboxMode(true); } catch (_) {} }
  return { inst, hasKeys: Boolean(key && secret) };
}

export default async function handler(req, res) {
  if (!isOwner(req)) return send(res, 401, { error: "Owner login required" });
  try {
    const { inst, hasKeys } = ownerExchange(req.query.exchange);
    if (!hasKeys) return send(res, 400, { error: "Owner testnet keys not configured on server" });
    const bal = await inst.fetchBalance();
    const usdt = (bal.total && bal.total.USDT) || 0;
    return send(res, 200, { usdt, free: (bal.free && bal.free.USDT) || 0, mode: "paper" });
  } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
}
