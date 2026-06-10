/**
 * QUANTUM TRADER v6 — Persistence Layer (SQLite via better-sqlite3)
 *
 * Three real things this gives you:
 *   1. OHLCV storage — candles persist; backtests run on stored history.
 *   2. Decision audit log — every signal + gate result + score is recorded.
 *   3. Order log — every placed order (paper/live) with its outcome.
 *
 * Synchronous, file-based (data.db). No server to run, no setup.
 */
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const db = new Database(join(__dirname, "data.db"));
db.pragma("journal_mode = WAL");   // concurrent reads, durable writes

// ── SCHEMA ───────────────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS candles (
  exchange  TEXT NOT NULL,
  symbol    TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  t         INTEGER NOT NULL,        -- open time (ms)
  o REAL, h REAL, l REAL, c REAL, v REAL,
  PRIMARY KEY (exchange, symbol, timeframe, t)
);
CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(exchange,symbol,timeframe,t);

CREATE TABLE IF NOT EXISTS decisions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,        -- when the decision was evaluated
  symbol    TEXT, exchange TEXT, dir TEXT,
  regime    TEXT, trade_allowed INTEGER,
  quant_score REAL, ml_prob REAL, of_score REAL, smc_bias TEXT,
  passed    INTEGER,                 -- 1 = all gates passed
  reason    TEXT,                    -- why it did / didn't trade
  entry_type TEXT, grade TEXT
);
CREATE INDEX IF NOT EXISTS idx_decisions_ts ON decisions(ts DESC);

CREATE TABLE IF NOT EXISTS orders (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ts        INTEGER NOT NULL,
  exchange  TEXT, mode TEXT, symbol TEXT, side TEXT,
  amount    REAL, fill_price REAL, status TEXT,
  sl REAL, tp1 REAL, tp2 REAL, tp3 REAL,
  quant_score REAL, ml_prob REAL, entry_type TEXT,
  exchange_order_id TEXT,
  exit_price REAL, pnl REAL, outcome TEXT,   -- filled in on close
  closed_ts INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orders_ts ON orders(ts DESC);
`);

// ── CANDLES ──────────────────────────────────────────────────────────────────
const _insCandle = db.prepare(`
  INSERT OR REPLACE INTO candles (exchange,symbol,timeframe,t,o,h,l,c,v)
  VALUES (@exchange,@symbol,@timeframe,@t,@o,@h,@l,@c,@v)
`);
const _insCandlesTx = db.transaction((rows) => { for (const r of rows) _insCandle.run(r); });

export function saveCandles(exchange, symbol, timeframe, candles) {
  if (!candles || !candles.length) return 0;
  const rows = candles.map(c => ({ exchange, symbol, timeframe, t:c.t, o:c.o, h:c.h, l:c.l, c:c.c, v:c.v }));
  _insCandlesTx(rows);
  return rows.length;
}

export function getCandles(exchange, symbol, timeframe, limit = 600) {
  const rows = db.prepare(`
    SELECT t,o,h,l,c,v FROM candles
    WHERE exchange=? AND symbol=? AND timeframe=?
    ORDER BY t DESC LIMIT ?
  `).all(exchange, symbol, timeframe, limit);
  return rows.reverse();   // chronological
}

export function candleStats() {
  return db.prepare(`
    SELECT exchange, symbol, timeframe, COUNT(*) n,
           MIN(t) first_t, MAX(t) last_t
    FROM candles GROUP BY exchange,symbol,timeframe
  `).all();
}

// ── DECISIONS (audit log) ────────────────────────────────────────────────────
const _insDecision = db.prepare(`
  INSERT INTO decisions
    (ts,symbol,exchange,dir,regime,trade_allowed,quant_score,ml_prob,of_score,smc_bias,passed,reason,entry_type,grade)
  VALUES
    (@ts,@symbol,@exchange,@dir,@regime,@trade_allowed,@quant_score,@ml_prob,@of_score,@smc_bias,@passed,@reason,@entry_type,@grade)
`);
export function logDecision(d) {
  _insDecision.run({
    ts: d.ts || Date.now(), symbol:d.symbol||null, exchange:d.exchange||null, dir:d.dir||null,
    regime:d.regime||null, trade_allowed:d.tradeAllowed?1:0,
    quant_score:d.quantScore??null, ml_prob:d.mlProb??null, of_score:d.ofScore??null,
    smc_bias:d.smcBias||null, passed:d.passed?1:0, reason:d.reason||null,
    entry_type:d.entryType||null, grade:d.grade||null,
  });
}
export function getDecisions(limit = 100) {
  return db.prepare(`SELECT * FROM decisions ORDER BY ts DESC LIMIT ?`).all(limit);
}

// ── ORDERS ───────────────────────────────────────────────────────────────────
const _insOrder = db.prepare(`
  INSERT INTO orders
    (ts,exchange,mode,symbol,side,amount,fill_price,status,sl,tp1,tp2,tp3,quant_score,ml_prob,entry_type,exchange_order_id)
  VALUES
    (@ts,@exchange,@mode,@symbol,@side,@amount,@fill_price,@status,@sl,@tp1,@tp2,@tp3,@quant_score,@ml_prob,@entry_type,@exchange_order_id)
`);
export function logOrder(o) {
  const info = _insOrder.run({
    ts:o.ts||Date.now(), exchange:o.exchange||null, mode:o.mode||null, symbol:o.symbol||null, side:o.side||null,
    amount:o.amount??null, fill_price:o.fillPrice??null, status:o.status||null,
    sl:o.sl??null, tp1:o.tp1??null, tp2:o.tp2??null, tp3:o.tp3??null,
    quant_score:o.quantScore??null, ml_prob:o.mlProb??null, entry_type:o.entryType||null,
    exchange_order_id:o.exchangeOrderId||null,
  });
  return info.lastInsertRowid;
}
export function closeOrder(id, exitPrice, pnl, outcome) {
  db.prepare(`UPDATE orders SET exit_price=?, pnl=?, outcome=?, closed_ts=? WHERE id=?`)
    .run(exitPrice, pnl, outcome, Date.now(), id);
}
export function getOrders(limit = 100) {
  return db.prepare(`SELECT * FROM orders ORDER BY ts DESC LIMIT ?`).all(limit);
}

// ── PERFORMANCE SUMMARY (computed from stored orders) ────────────────────────
export function performance() {
  const closed = db.prepare(`SELECT pnl FROM orders WHERE outcome IS NOT NULL`).all();
  const n = closed.length;
  const wins = closed.filter(r => r.pnl > 0).length;
  const net = closed.reduce((s,r) => s + (r.pnl||0), 0);
  const gp = closed.filter(r=>r.pnl>0).reduce((s,r)=>s+r.pnl,0);
  const gl = Math.abs(closed.filter(r=>r.pnl<=0).reduce((s,r)=>s+r.pnl,0));
  return {
    totalClosed:n, wins, losses:n-wins,
    winRate: n ? +(wins/n*100).toFixed(1) : 0,
    netPnl: +net.toFixed(2),
    profitFactor: gl>0 ? +(gp/gl).toFixed(2) : (gp>0?99:0),
  };
}

export default db;
