# Deploy Quantum Trader to a public URL (Vercel) — paper/testnet only

This gives you a real link (e.g. quantum-trader.vercel.app) that opens on any
phone. It has:
- General user SIGN UP / LOG IN  (any visitor can register, see live data, paper-simulate)
- A PERSONAL OWNER GATE protecting YOUR testnet keys (only you can place orders
  through your testnet account)

Your API keys live ONLY in Vercel's encrypted environment variables — never in
the browser, never reachable by other users. This deploy is PAPER/TESTNET ONLY
by design; it will not place live real-money orders.

────────────────────────────────────────────────────
## 1. Push the project to GitHub
────────────────────────────────────────────────────
1. Create a free GitHub account if needed (github.com)
2. Create a new EMPTY repo, e.g. "quantum-trader"
3. In the qt-deploy folder:

   git init
   git add .
   git commit -m "Quantum Trader"
   git branch -M main
   git remote add origin https://github.com/YOURNAME/quantum-trader.git
   git push -u origin main

(.env and node_modules are gitignored — your local keys do NOT get pushed. Good.)

────────────────────────────────────────────────────
## 2. Deploy on Vercel
────────────────────────────────────────────────────
1. Go to vercel.com → sign in with GitHub (free)
2. "Add New → Project" → import your quantum-trader repo
3. Framework preset: Vite (auto-detected). Click Deploy.
4. First deploy will succeed but data/login won't work yet — you need env vars (next step)

────────────────────────────────────────────────────
## 3. Set environment variables in Vercel
────────────────────────────────────────────────────
Project → Settings → Environment Variables. Add:

  JWT_SECRET           = (any long random string — your login signing secret)
  OWNER_GATE_SECRET    = (a strong password ONLY you know — unlocks your testnet)
  BINANCE_TESTNET_KEY  = (your Binance testnet key)
  BINANCE_TESTNET_SECRET = (your Binance testnet secret)

Optional (for other exchanges):
  BYBIT_TESTNET_KEY / BYBIT_TESTNET_SECRET
  OKX_TESTNET_KEY / OKX_TESTNET_SECRET / OKX_PASSPHRASE

Optional (persistent user accounts across restarts — recommended):
  Set up Vercel KV (Storage tab → Create → KV). It auto-adds KV_REST_API_URL
  and KV_REST_API_TOKEN. Without KV, accounts work but reset on cold starts.

After adding vars: Deployments → ... → Redeploy.

────────────────────────────────────────────────────
## 4. Use it
────────────────────────────────────────────────────
- Open your-project.vercel.app on any phone
- Sign up / log in (general users)
- To trade your testnet: enter your OWNER_GATE_SECRET in the app's owner-gate
  field → now Test Connection and orders use YOUR server-held testnet keys
- Other logged-in users can view data and paper-simulate, but can NEVER reach
  your keys (every order endpoint checks the owner gate server-side)

────────────────────────────────────────────────────
## Security notes (read these)
────────────────────────────────────────────────────
- This deploy is PAPER/TESTNET ONLY. It does not place live real-money orders.
  Keep real-money trading on your local machine.
- Your OWNER_GATE_SECRET is the only thing protecting your testnet account from
  other logged-in users. Make it long and unique. Never share it.
- Live WebSocket streaming is disabled on Vercel (serverless has no long-lived
  sockets) — the app uses REST polling, which works fine on a hosted URL.
- The audit SQLite DB does not persist on serverless. Decision/order history on
  the deployed version is best-effort. For full persistence, run the local
  backend (the original server/ folder) on your own machine.
