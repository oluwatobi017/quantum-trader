import { verifyPassword, issueToken, send } from "./_lib/auth.js";
import { getUser } from "./_lib/users.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "POST only" });
  const { email, password } = req.body || {};
  if (!email || !password) return send(res, 400, { error: "Email and password required" });
  const user = await getUser(email);
  if (!user || !verifyPassword(password, user.pass)) {
    return send(res, 401, { error: "Invalid email or password" });
  }
  const token = issueToken({ email: user.email });
  return send(res, 200, { ok: true, token, email: user.email });
}
