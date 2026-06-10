# Quantum Trader v6 — Backend (secure trading + data/audit layer)

NEW in v6: a SQLite database (data.db) that persists every candle, gate
decision, and order. The Data & Audit tab in the app reads from it. The DB
file is created automatically on first run — no setup.

This server holds your exchange API keys and signs all orders. Your keys never
touch the browser. The frontend calls this server; this server calls the exchange.

## Setup (5 minutes)

1. Install Node.js (nodejs.org, LTS).
2. In this `server` folder:

       npm install express cors ccxt dotenv better-sqlite3 ws

   (or just `npm install` — package.json already lists them)

3. Create your secrets file:

       cp .env.example .env

4. Open `.env` and paste your TESTNET keys:
   - Binance testnet → https://testnet.binance.vision (log in with GitHub → Generate HMAC key)
   - Bybit testnet   → https://testnet.bybit.com (API Management → create key)
   - OKX demo        → https://www.okx.com/demo-trading (also needs OKX_PASSPHRASE)

   Leave ALLOW_LIVE=false. Leave the LIVE keys empty for now.

5. Start it:

       npm start

   You'll see: "Quantum Trader backend on http://localhost:8787"

6. Start the frontend in the OTHER folder (parent):

       cd ..
       npm install
       npm run dev

   The frontend's `/srv` proxy routes to this backend automatically.

## Test it works

- Open http://localhost:8787/api/health → shows which exchanges are configured
- In the app: Settings → Test Connection → should show your real testnet balance
- Start the bot (or Demo Gates) → orders are placed SERVER-SIDE on the testnet

## Going live (only after weeks of paper testing)

1. Fill the LIVE keys (BINANCE_KEY/SECRET etc.) in `.env`
2. Set ALLOW_LIVE=true
3. In the app, Settings → Trading Mode → LIVE
4. Start with $10–50. The kill switch and risk limits stay active.

The server REFUSES live orders unless ALLOW_LIVE=true — a deliberate safety lock.

## Why this is the right architecture

- Secrets live only in `.env` on the server (gitignored, never shipped to browser)
- Live trading is double-gated: ALLOW_LIVE flag + per-order mode check
- CCXT handles exchange differences, signing, and testnet routing
- Same server also proxies market data (/api/candles, /api/ticker) with zero CORS

## v6 NEW: derivatives feeds, sentiment, correlation, Docker

New endpoints (all real exchange data via CCXT; "n/a" when an exchange doesn't expose a feed):
- GET /api/funding        — perp funding rate
- GET /api/openinterest   — open interest
- GET /api/orderbook      — real bid/ask imbalance + whale walls
- GET /api/liquidations   — recent liquidation pressure
- GET /api/microstructure — all of the above in one call
- GET /api/feargreed      — Fear & Greed index (free, no key)
- GET /api/news           — needs NEWS_API_KEY in .env (newsapi.org)

Frontend additions:
- Order Flow tab shows live funding / OI / orderbook imbalance / liquidations
- Header shows the Fear & Greed index; trading auto-pauses at true extremes (≤8 or ≥92)
- Correlation control: blocks stacking highly-correlated same-direction positions
  (e.g. won't open BTC+ETH+SOL all long past 0.80 correlation)

## Run with Docker (optional)
From the project root:

    docker compose up --build

Backend → http://localhost:8787, Frontend → http://localhost:4173.
Put your keys in server/.env first (copy from server/.env.example).
The data.db persists in a named volume.
