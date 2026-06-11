import { send } from "./_lib/auth.js";

// Single-owner deployment: public sign-up is disabled by design.
export default async function handler(req, res) {
  return send(res, 403, { error: "Sign-up disabled — single-owner deployment. Use the owner login." });
}
