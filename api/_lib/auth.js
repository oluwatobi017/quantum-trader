// Shared auth utilities for Vercel serverless functions.
// Uses jsonwebtoken + a simple HMAC password hash (no DB needed for the demo;
// users are stored in a hosted KV/Postgres in production — see notes).
import jwt from "jsonwebtoken";
import crypto from "crypto";

const JWT_SECRET = process.env.JWT_SECRET || "CHANGE_ME_IN_VERCEL_ENV";

// ── password hashing (scrypt) ──
export function hashPassword(password, salt) {
  const s = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, s, 64).toString("hex");
  return s + ":" + hash;
}
export function verifyPassword(password, stored) {
  if (!stored || stored.indexOf(":") < 0) return false;
  const parts = stored.split(":");
  const salt = parts[0];
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(parts[1]), Buffer.from(check));
}

// ── JWT issue / verify ──
export function issueToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}
export function verifyToken(req) {
  const auth = req.headers.authorization || "";
  const token = auth.indexOf("Bearer ") === 0 ? auth.slice(7) : null;
  if (!token) return null;
  try { return jwt.verify(token, JWT_SECRET); } catch (_) { return null; }
}

// ── the PERSONAL gate: only the owner who knows OWNER_GATE_SECRET ──
// This is checked server-side before any order touches the owner's testnet keys.
export function ownerGateOK(req) {
  const provided = req.headers["x-owner-gate"] || (req.body && req.body.ownerGate);
  const secret = process.env.OWNER_GATE_SECRET;
  if (!secret || !provided) return false;
  try { return crypto.timingSafeEqual(Buffer.from(String(provided)), Buffer.from(secret)); }
  catch (_) { return false; }
}

// CORS + JSON helper
export function send(res, status, obj) {
  res.setHeader("Content-Type", "application/json");
  res.status(status).json(obj);
}
