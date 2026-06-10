/**
 * QUANTUM TRADER v6 — Live WebSocket Streaming
 *
 * Connects to EXCHANGE public WebSockets (free, no API key) and relays a
 * normalized price stream to all connected frontend clients over one WS.
 *
 * Upstream:  Binance / Bybit public trade+kline streams
 * Downstream: ws://<host>/stream  → { type:"tick", exchange, symbol, price, ts }
 *
 * No CCXT Pro (paid) — uses the raw 'ws' client against public endpoints.
 */
import { WebSocketServer, WebSocket } from "ws";

// our symbol → exchange stream symbol
function toBinanceStream(sym){ return sym.replace("/","").toLowerCase(); }      // BTC/USDT → btcusdt
function toBybitSymbol(sym){ return sym.replace("/",""); }                       // BTC/USDT → BTCUSDT

const DEFAULT_SYMBOLS = ["BTC/USDT","ETH/USDT","SOL/USDT","BNB/USDT","AVAX/USDT","OP/USDT"];

export function attachWebSocket(httpServer, opts = {}) {
  const symbols = opts.symbols || DEFAULT_SYMBOLS;
  const wss = new WebSocketServer({ server: httpServer, path: "/stream" });

  // Latest price cache, broadcast to any client that connects
  const lastTick = {}; // key: exchange:symbol → {price, ts}

  // ── Fan-out to all frontend clients ──
  function broadcast(msg) {
    const data = JSON.stringify(msg);
    wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(data); });
  }

  // ── Upstream: BINANCE combined stream (trade tickers) ──
  let binanceWS = null, binanceRetry = 0;
  function connectBinance() {
    // combined stream: /stream?streams=btcusdt@trade/ethusdt@trade/...
    const streams = symbols.map(s => toBinanceStream(s) + "@trade").join("/");
    const url = "wss://stream.binance.com:9443/stream?streams=" + streams;
    binanceWS = new WebSocket(url);

    binanceWS.on("open", () => { binanceRetry = 0; console.log("[ws] Binance connected"); });
    binanceWS.on("message", (buf) => {
      try {
        const m = JSON.parse(buf.toString());
        const d = m.data; if (!d || !d.s || !d.p) return;
        // d.s = "BTCUSDT", d.p = price
        const sym = symbols.find(x => toBinanceStream(x) === d.s.toLowerCase()); if (!sym) return;
        const price = parseFloat(d.p), ts = d.T || Date.now();
        lastTick["binance:" + sym] = { price, ts };
        broadcast({ type:"tick", exchange:"binance", symbol:sym, price, ts });
      } catch(_){}
    });
    binanceWS.on("close", () => { scheduleReconnect("binance"); });
    binanceWS.on("error", (e) => { console.log("[ws] Binance error:", e.message); try{binanceWS.close()}catch(_){} });
  }

  // ── Upstream: BYBIT public spot stream ──
  let bybitWS = null, bybitRetry = 0, bybitPing = null;
  function connectBybit() {
    const url = "wss://stream.bybit.com/v5/public/spot";
    bybitWS = new WebSocket(url);

    bybitWS.on("open", () => {
      bybitRetry = 0; console.log("[ws] Bybit connected");
      // subscribe to tickers for each symbol
      const args = symbols.map(s => "tickers." + toBybitSymbol(s));
      bybitWS.send(JSON.stringify({ op:"subscribe", args }));
      // Bybit requires ping every 20s
      bybitPing = setInterval(() => { try { bybitWS.send(JSON.stringify({op:"ping"})); } catch(_){} }, 20000);
    });
    bybitWS.on("message", (buf) => {
      try {
        const m = JSON.parse(buf.toString());
        if (!m.topic || !m.data) return;
        const d = m.data;
        const bsym = (d.symbol || (m.topic.split(".")[1])); // BTCUSDT
        const sym = symbols.find(x => toBybitSymbol(x) === bsym); if (!sym) return;
        const price = parseFloat(d.lastPrice || d.lp || d.markPrice); if (!isFinite(price)) return;
        const ts = Date.now();
        lastTick["bybit:" + sym] = { price, ts };
        broadcast({ type:"tick", exchange:"bybit", symbol:sym, price, ts });
      } catch(_){}
    });
    bybitWS.on("close", () => { if (bybitPing) clearInterval(bybitPing); scheduleReconnect("bybit"); });
    bybitWS.on("error", (e) => { console.log("[ws] Bybit error:", e.message); try{bybitWS.close()}catch(_){} });
  }

  // ── Reconnect with capped exponential backoff ──
  function scheduleReconnect(which) {
    if (which === "binance") {
      binanceRetry = Math.min(binanceRetry + 1, 6);
      const delay = Math.min(1000 * 2 ** binanceRetry, 30000);
      console.log(`[ws] Binance reconnect in ${delay}ms`);
      setTimeout(connectBinance, delay);
    } else {
      bybitRetry = Math.min(bybitRetry + 1, 6);
      const delay = Math.min(1000 * 2 ** bybitRetry, 30000);
      console.log(`[ws] Bybit reconnect in ${delay}ms`);
      setTimeout(connectBybit, delay);
    }
  }

  // ── Frontend client connects ──
  wss.on("connection", (client) => {
    console.log(`[ws] client connected (${wss.clients.size} total)`);
    // send the latest known prices immediately so the UI isn't blank
    Object.entries(lastTick).forEach(([k, v]) => {
      const [exchange, symbol] = k.split(":");
      client.send(JSON.stringify({ type:"tick", exchange, symbol, price:v.price, ts:v.ts }));
    });
    client.on("close", () => console.log(`[ws] client left (${wss.clients.size} total)`));
  });

  // Kick off upstream connections
  connectBinance();
  connectBybit();

  console.log(`[ws] streaming ${symbols.length} symbols on /stream`);
  return { wss, lastTick };
}
