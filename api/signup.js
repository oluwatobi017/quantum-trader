import { hashPassword, issueToken, send } from "./_lib/auth.js";
import { getUser, putUser } from "./_lib/users.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const { email, password } = req.body || {};
  if (!email || !password) return send(res, 400, { error: "Email and password required" });
  if (String(password).length < 8) return send(res, 400, { error: "Password must be at least 8 characters" });
  const existing = await getUser(email);
  if (existing) return send(res, 409, { error: "Account already exists — please log in" });
  const record = { email: email.toLowerCase(), pass: hashPassword(password), created: Date.now() };
  await putUser(email, record);
  const token = issueToken({ email: record.email });
  return send(res, 200, { ok: true, token, email: record.email });
}
