# Quantum Trader v5 — Run It For Real

This is the live, working version. The Claude artifact can't fetch market data
(its sandbox blocks all external APIs). This project runs as a normal web app
where data, paper trading, and live trading all work. The built-in proxy means
there is NO CORS problem — every exchange is reachable.

────────────────────────────────────────────────────────
## FASTEST PATH — Run on a computer (10 minutes)
────────────────────────────────────────────────────────

You need Node.js (free): https://nodejs.org  → download the "LTS" version, install it.

Then, in a terminal, inside this folder:

    npm install
    npm run dev

It prints two URLs, e.g.:
    Local:   http://localhost:5173/
    Network: http://192.168.1.20:5173/   ← open THIS on your phone (same WiFi)

Open the Local URL in your browser. You'll see REAL DATA flowing.

────────────────────────────────────────────────────────
## PHONE-ONLY PATH — No computer? Use a free cloud IDE
────────────────────────────────────────────────────────

1. Go to  https://stackblitz.com  (works in a phone browser, free, no install)
2. Tap "Create" → choose a blank "Vite + React" project
3. Replace its files with the files in this folder:
   - package.json
   - vite.config.js
   - index.html
   - src/main.jsx
   - src/App.jsx
4. StackBlitz auto-runs it. Data works because StackBlitz proxies requests.

(Alternatives that also work from a phone: codesandbox.io, replit.com,
 gitpod.io — any "Vite React" cloud workspace.)

────────────────────────────────────────────────────────
## DEPLOY IT PERMANENTLY (free, public URL)
────────────────────────────────────────────────────────

Once it runs locally:

    npm run build        → creates a "dist" folder

Then drag-and-drop the project folder onto:
   - https://vercel.com    (free, automatic, gives you a URL)
   - or https://netlify.com (free, drag the folder onto the page)

NOTE: A pure static deploy (Vercel/Netlify) won't have the dev proxy, so for
production you'd use Kraken + CoinGecko (both allow direct browser calls) which
the app already falls back to automatically. For Binance/Bybit live trading,
deploy with the included proxy (Vercel serverless functions or a small Node
server) — ask and I'll generate that config.

────────────────────────────────────────────────────────
## USING IT
────────────────────────────────────────────────────────

- Live PRICES need no keys — they load automatically.
- PAPER trading with real fills: make a free testnet key:
    Binance: testnet.binance.vision
    Bybit:   testnet.bybit.com
  Paste it in Settings → Test Connection.
- Keep Trading Mode on PAPER until you've watched it for weeks.
- LIVE mode with real money: only after long paper testing, start $10–50.

The strict gates (Quant Score ≥80, ML ≥60%, regime allowed) mean trades are
rare — that's correct. Use "Demo Gates" only to watch the pipeline work.

────────────────────────────────────────────────────────
## COPY TRADE TAB
────────────────────────────────────────────────────────

The provider is YOUR own live pipeline (real signals). Followers mirror its
entries, each sized from its own equity × allocation × max-risk.

- Open the Copy Trade tab (menu → Copy Trade)
- Each follower: set Capital, Allocation %, Max Risk/Trade, Max Positions
- Filter which symbols each follower copies (or ALL)
- Enable a follower → when the bot opens a position, that follower mirrors it
  scaled to ITS settings, and shows its own equity, return, win rate, and open
  copied positions in real time
- When the provider takes profit / exits, every follower leg settles
  proportionally on its own balance

All P&L is real (computed from real price), never invented. There is no fake
"master trader" — the provider is your transparent engine.

────────────────────────────────────────────────────────
## SECURE SERVER-SIDE TRADING (recommended)
────────────────────────────────────────────────────────

The `server/` folder is a backend that signs orders with your keys kept ONLY on
the server — never in the browser. This is the correct, secure way to trade.

  cd server
  npm install express cors ccxt dotenv
  cp .env.example .env      # paste your testnet keys
  npm start                 # runs on http://localhost:8787

Then in the main folder:  npm run dev

The app auto-detects the backend (via the /srv proxy) and routes all orders and
balance checks through it. If the backend isn't running, the app falls back to
browser-side testnet calls (paper only — it will NEVER browser-sign a live order).

Full details: server/README.md
