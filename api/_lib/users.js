// Minimal user store. Uses Vercel KV if configured, else in-memory fallback
// (fine for a personal/paper deployment; resets on serverless cold start).
let kv = null;
let kvReady = (async function () {
  try {
    if (process.env.KV_REST_API_URL) {
      const mod = await import("@vercel/kv");
      kv = mod.kv;
    }
  } catch (_) { kv = null; }
})();

const mem = new Map(); // fallback store

export async function getUser(email) {
  await kvReady;
  const key = "user:" + email.toLowerCase();
  if (kv) { try { return await kv.get(key); } catch (_) { return mem.get(key) || null; } }
  return mem.get(key) || null;
}
export async function putUser(email, record) {
  await kvReady;
  const key = "user:" + email.toLowerCase();
  if (kv) { try { await kv.set(key, record); return; } catch (_) {} }
  mem.set(key, record);
}
