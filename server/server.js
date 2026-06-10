/**
 * QUANTUM TRADER — Backend
 * Server-side order signing (CCXT) + market-data proxy (kills CORS).
 *
 * SECURITY MODEL
 * - API secrets are read from .env on the SERVER. They are never sent to,
 *   stored in, or exposed to the browser.
 * - The frontend calls this server; this server talks to the exchange.
 * - Live trading is OFF unless ALLOW_LIVE=true in .env (paper/testnet default).
 */
import express from "express";
import cors from "cors";
import ccxt from "ccxt";
import dotenv from "dotenv";
import * as store from "./db.js";
import { attachWebSocket } from "./ws.js";
import * as feeds from "./feeds.js";
dotenv.config();

const app  = express();
const PORT = process.env.PORT || 8787;

app.use(cors({ origin: (process.env.ALLOWED_ORIGINS || "*").split(",") }));
app.use(express.json({ limit: "256kb" }));

// ── Simple request log ───────────────────────────────────────────────────────
app.use((req, _res, next) => { console.log(`${new Date().toISOString()} ${req.method} ${req.path}`); next(); });

// ── Build a CCXT exchange instance on demand ─────────────────────────────────
// Credentials come ONLY from environment variables, keyed per exchange + mode.
function makeExchange(name, mode) {
  const ex = name.toLowerCase();                       // "binance" | "bybit" | "okx"
  const isPaper = mode !== "live";                     // default: paper/testnet
  const up = ex.toUpperCase();
  const key    = process.env[`${up}_${isPaper ? "TESTNET_" : ""}KEY`]    || process.env[`${up}_KEY`]    || "";
  const secret = process.env[`${up}_${isPaper ? "TESTNET_" : ""}SECRET`] || process.env[`${up}_SECRET`] || "";
  const pass   = process.env[`${up}_PASSPHRASE`] || undefined;          // OKX needs this

  if (!ccxt[ex]) throw new Error(`Unsupported exchange: ${name}`);
  const klass = ccxt[ex];
  const inst = new klass({
    apiKey: key,
    secret: secret,
    password: pass,
    enableRateLimit: true,
    options: { defaultType: "spot" },
  });
  // Route to testnet/sandbox when in paper mode (CCXT handles the URLs)
  if (isPaper && typeof inst.setSandboxMode === "function") {
    try { inst.setSandboxMode(true); } catch (_) {}
  }
  return { inst, isPaper, hasKeys: Boolean(key && secret) };
}

// ── Guard: block live trading unless explicitly enabled ──────────────────────
function liveAllowed() { return String(process.env.ALLOW_LIVE).toLowerCase() === "true"; }

// ── HEALTH ───────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    liveEnabled: liveAllowed(),
    exchangesConfigured: ["binance", "bybit", "okx"].filter(e => {
      const up = e.toUpperCase();
      return process.env[`${up}_KEY`] || process.env[`${up}_TESTNET_KEY`];
    }),
    ts: Date.now(),
  });
});

// ── MARKET DATA PROXY (no keys needed) — kills CORS for the deployed app ──────
// GET /api/candles?exchange=binance&symbol=BTC/USDT&timeframe=1m&limit=600
app.get("/api/candles", async (req, res) => {
  try {
    const { exchange = "binance", symbol = "BTC/USDT", timeframe = "1m", limit = 600 } = req.query;
    const ex = exchange.toLowerCase();
    if (!ccxt[ex]) return res.status(400).json({ error: "Unsupported exchange" });
    const inst = new ccxt[ex]({ enableRateLimit: true, timeout: 9000 });
    const ohlcv = await inst.fetchOHLCV(symbol, timeframe, undefined, Number(limit));
    const candles = ohlcv.map(k => ({ t:k[0], o:k[1], h:k[2], l:k[3], c:k[4], v:k[5] }));
    // Persist to the OHLCV database
    try { store.saveCandles(ex, symbol, timeframe, candles); } catch(_){}
    res.json({ source: "LIVE", exchange: ex, candles });
  } catch (e) {
    // Network/exchange failed — serve stored history if we have any
    try {
      const { exchange = "binance", symbol = "BTC/USDT", timeframe = "1m", limit = 600 } = req.query;
      const cached = store.getCandles(exchange.toLowerCase(), symbol, timeframe, Number(limit));
      if (cached && cached.length >= 30) return res.json({ source: "STORED", exchange, candles: cached });
    } catch(_){}
    res.status(502).json({ error: String(e.message || e) });
  }
});

// GET /api/ticker?exchange=binance&symbol=BTC/USDT
app.get("/api/ticker", async (req, res) => {
  try {
    const { exchange = "binance", symbol = "BTC/USDT" } = req.query;
    const ex = exchange.toLowerCase();
    const inst = new ccxt[ex]({ enableRateLimit: true });
    const t = await inst.fetchTicker(symbol);
    res.json({ bid: t.bid, ask: t.ask, mid: (t.bid + t.ask) / 2 || t.last, spread: (t.ask - t.bid) || 0, last: t.last });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ── BALANCE (authenticated, server-side keys) ────────────────────────────────
// GET /api/balance?exchange=binance&mode=paper
app.get("/api/balance", async (req, res) => {
  try {
    const { exchange = "binance", mode = "paper" } = req.query;
    const { inst, isPaper, hasKeys } = makeExchange(exchange, mode);
    if (!hasKeys) return res.status(400).json({ error: `No ${exchange} ${isPaper ? "testnet " : ""}keys configured in .env` });
    const bal = await inst.fetchBalance();
    const usdt = (bal.total && bal.total.USDT) || 0;
    res.json({ exchange, mode: isPaper ? "paper" : "live", usdt, free: (bal.free && bal.free.USDT) || 0 });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ── PLACE ORDER (authenticated, server-side signing) ─────────────────────────
// POST /api/order  { exchange, mode, symbol, side, amount, type, price?, stopLoss? }
app.post("/api/order", async (req, res) => {
  try {
    const { exchange = "binance", mode = "paper", symbol, side, amount, type = "market", price, stopLoss } = req.body || {};
    if (!symbol || !side || !amount) return res.status(400).json({ error: "symbol, side, amount required" });
    if (mode === "live" && !liveAllowed()) {
      return res.status(403).json({ error: "Live trading disabled. Set ALLOW_LIVE=true in .env to enable." });
    }
    const { inst, isPaper, hasKeys } = makeExchange(exchange, mode);
    if (!hasKeys) return res.status(400).json({ error: `No ${exchange} ${isPaper ? "testnet " : ""}keys configured` });

    // Primary order
    const order = type === "limit" && price
      ? await inst.createOrder(symbol, "limit", side, Number(amount), Number(price))
      : await inst.createOrder(symbol, "market", side, Number(amount));

    // Optional protective stop-loss (best-effort; failure won't void the entry)
    let slOrder = null;
    if (stopLoss) {
      const closeSide = side === "buy" ? "sell" : "buy";
      try {
        slOrder = await inst.createOrder(symbol, "stop_loss", closeSide, Number(amount), undefined, { stopPrice: Number(stopLoss) });
      } catch (slErr) {
        slOrder = { warning: "SL not placed: " + String(slErr.message || slErr) };
      }
    }

    // Persist the order to the audit DB
    let dbId = null;
    try {
      dbId = store.logOrder({
        exchange, mode: isPaper?"paper":"live", symbol, side,
        amount: Number(amount), fillPrice: order.average||order.price||null,
        status: order.status, sl: stopLoss||null,
        quantScore: req.body.quantScore, mlProb: req.body.mlProb, entryType: req.body.entryType,
        exchangeOrderId: order.id,
      });
    } catch(_){}
    res.json({
      ok: true,
      mode: isPaper ? "paper" : "live",
      id: order.id,
      dbId,
      status: order.status,
      fillPrice: order.average || order.price || null,
      filled: order.filled,
      cost: order.cost,
      fee: order.fee,
      stopLoss: slOrder,
    });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ── OPEN POSITIONS / ORDERS (authenticated) ──────────────────────────────────
app.get("/api/positions", async (req, res) => {
  try {
    const { exchange = "binance", mode = "paper" } = req.query;
    const { inst, hasKeys } = makeExchange(exchange, mode);
    if (!hasKeys) return res.status(400).json({ error: "No keys configured" });
    const open = await inst.fetchOpenOrders().catch(() => []);
    res.json({ openOrders: open });
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
});

// ── DECISION AUDIT LOG ───────────────────────────────────────────────────────
// POST /api/decision  — frontend logs each gate evaluation here
app.post("/api/decision", (req, res) => {
  try { store.logDecision(req.body || {}); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: String(e.message||e) }); }
});
app.get("/api/decisions", (req, res) => {
  try { res.json({ decisions: store.getDecisions(Number(req.query.limit)||100) }); }
  catch (e) { res.status(500).json({ error: String(e.message||e) }); }
});

// ── ORDER CLOSE (record outcome) ─────────────────────────────────────────────
app.post("/api/order/close", (req, res) => {
  try {
    const { id, exitPrice, pnl, outcome } = req.body || {};
    if (!id) return res.status(400).json({ error: "id required" });
    store.closeOrder(id, exitPrice, pnl, outcome);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: String(e.message||e) }); }
});
app.get("/api/orders", (req, res) => {
  try { res.json({ orders: store.getOrders(Number(req.query.limit)||100) }); }
  catch (e) { res.status(500).json({ error: String(e.message||e) }); }
});

// ── DATA + PERFORMANCE SUMMARY ───────────────────────────────────────────────
app.get("/api/stored", (_req, res) => {
  try { res.json({ candles: store.candleStats(), performance: store.performance() }); }
  catch (e) { res.status(500).json({ error: String(e.message||e) }); }
});

// ── SENTIMENT: FEAR & GREED INDEX (free, no key) ─────────────────────────────
app.get("/api/feargreed", async (_req, res) => {
  try {
    const r = await fetch("https://api.alternative.me/fng/?limit=2");
    const d = await r.json();
    const cur = d.data && d.data[0];
    const prev = d.data && d.data[1];
    if (!cur) return res.status(502).json({ error: "No data" });
    const val = Number(cur.value);
    res.json({
      value: val, label: cur.value_classification,
      prev: prev ? Number(prev.value) : null,
      // Trading guidance: extremes are where risk is highest
      tradeAdvice: val <= 10 ? "EXTREME_FEAR — capitulation risk, size down" :
                   val >= 90 ? "EXTREME_GREED — euphoria, tighten risk" : "NORMAL",
      block: (val <= 8 || val >= 92), // hard block at the true extremes
      ts: Date.now(),
    });
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

// ── NEWS (requires your own API key in .env: NEWS_API_KEY) ───────────────────
// Structure only — supply a key. Without one it returns supported:false so the
// app never fabricates headlines.
app.get("/api/news", async (req, res) => {
  const key = process.env.NEWS_API_KEY;
  if (!key) return res.json({ supported: false, note: "Set NEWS_API_KEY in .env to enable" });
  try {
    const q = encodeURIComponent(req.query.q || "crypto OR bitcoin OR ethereum");
    const r = await fetch(`https://newsapi.org/v2/everything?q=${q}&sortBy=publishedAt&pageSize=10&language=en&apiKey=${key}`);
    const d = await r.json();
    const articles = (d.articles || []).map(a => ({ title: a.title, source: a.source && a.source.name, ts: a.publishedAt, url: a.url }));
    res.json({ supported: true, articles });
  } catch (e) { res.status(502).json({ supported: false, error: String(e.message || e) }); }
});

// ── DERIVATIVES & MICROSTRUCTURE FEEDS (v6) ──────────────────────────────────
app.get("/api/funding", async (req, res) => {
  try { res.json(await feeds.getFundingRate(req.query.exchange||"binance", req.query.symbol||"BTC/USDT:USDT")); }
  catch (e) { res.status(502).json({ supported:false, error:String(e.message||e) }); }
});
app.get("/api/openinterest", async (req, res) => {
  try { res.json(await feeds.getOpenInterest(req.query.exchange||"binance", req.query.symbol||"BTC/USDT:USDT")); }
  catch (e) { res.status(502).json({ supported:false, error:String(e.message||e) }); }
});
app.get("/api/orderbook", async (req, res) => {
  try { res.json(await feeds.getOrderbook(req.query.exchange||"binance", req.query.symbol||"BTC/USDT", Number(req.query.depth)||25)); }
  catch (e) { res.status(502).json({ supported:false, error:String(e.message||e) }); }
});
app.get("/api/liquidations", async (req, res) => {
  try { res.json(await feeds.getLiquidations(req.query.exchange||"binance", req.query.symbol||"BTC/USDT:USDT")); }
  catch (e) { res.status(502).json({ supported:false, error:String(e.message||e) }); }
});
// One call for the whole derivatives snapshot
app.get("/api/microstructure", async (req, res) => {
  try { res.json(await feeds.getMicrostructure(req.query.exchange||"binance", req.query.symbol||"BTC/USDT")); }
  catch (e) { res.status(502).json({ error:String(e.message||e) }); }
});

const httpServer = app.listen(PORT, () => {
  console.log(`\nQuantum Trader backend on http://localhost:${PORT}`);
  console.log(`Live trading: ${liveAllowed() ? "ENABLED ⚠" : "disabled (paper only)"}`);
  console.log(`Health:  http://localhost:${PORT}/api/health`);
  console.log(`Stream:  ws://localhost:${PORT}/stream\n`);
});

// ── Live WebSocket streaming (Binance + Bybit public, free, no key) ──
attachWebSocket(httpServer, {
  symbols: ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","AVAX/USDT","OP/USDT"],
});
