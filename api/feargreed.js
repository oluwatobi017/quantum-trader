import { verifyToken, send } from "./_lib/auth.js";
export default async function handler(req, res) {
  if (!verifyToken(req)) return send(res, 401, { error: "Login required" });
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=2");
    const d = await r.json();
    const cur = d.data && d.data[0];
    if (!cur) return send(res, 502, { error: "No data" });
    const val = Number(cur.value);
    return send(res, 200, { value: val, label: cur.value_classification,
      tradeAdvice: val<=10?"EXTREME_FEAR":val>=90?"EXTREME_GREED":"NORMAL",
      block: (val<=8||val>=92), ts: Date.now() });
  } catch (e) { return send(res, 502, { error: String(e.message || e) }); }
}
