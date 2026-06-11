import { issueToken, send } from "./_lib/auth.js";

// Single-owner login. Credentials live in Vercel env vars (OWNER_EMAIL,
// OWNER_PASSWORD) — no database needed, which is why this works on serverless.
export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const OE = process.env.OWNER_EMAIL;
  const OP = process.env.OWNER_PASSWORD;
  if (!OE || !OP) return send(res, 500, { error: "Server missing OWNER_EMAIL / OWNER_PASSWORD env vars" });
  const body = req.body || {};
  const email = body.email;
  const password = body.password;
  if (!email || !password) return send(res, 400, { error: "Email and password required" });
  const ok = String(email).toLowerCase() === String(OE).toLowerCase() && String(password) === String(OP);
  if (!ok) return send(res, 401, { error: "Invalid email or password" });
  const token = issueToken({ email: String(OE).toLowerCase(), owner: true });
  return send(res, 200, { ok: true, token, email: String(OE).toLowerCase() });
}
