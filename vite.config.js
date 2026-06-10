import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The dev server proxies exchange APIs so there is NO CORS problem at all.
// Your app can fetch from "/api/binance/api/v3/klines?..." and Vite forwards
// it to the real exchange from the server side.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,            // expose on your LAN so a phone can open it
    proxy: {
      "/api/binance":  { target: "https://api.binance.com",     changeOrigin: true, rewrite: p => p.replace(/^\/api\/binance/, "") },
      "/api/bybit":    { target: "https://api.bybit.com",       changeOrigin: true, rewrite: p => p.replace(/^\/api\/bybit/, "") },
      "/api/okx":      { target: "https://www.okx.com",         changeOrigin: true, rewrite: p => p.replace(/^\/api\/okx/, "") },
      "/api/kraken":   { target: "https://api.kraken.com",      changeOrigin: true, rewrite: p => p.replace(/^\/api\/kraken/, "") },
      "/api/coingecko":{ target: "https://api.coingecko.com",   changeOrigin: true, rewrite: p => p.replace(/^\/api\/coingecko/, "") },
      "/api/binance-testnet": { target: "https://testnet.binance.vision", changeOrigin: true, rewrite: p => p.replace(/^\/api\/binance-testnet/, "") },
      "/api/bybit-testnet":   { target: "https://api-testnet.bybit.com",  changeOrigin: true, rewrite: p => p.replace(/^\/api\/bybit-testnet/, "") },
      // Backend (server-side order signing + data). Run server with: cd server && npm install && npm start
      "/srv":          { target: "http://localhost:8787", changeOrigin: true, ws: true, rewrite: p => p.replace(/^\/srv/, "") },
    },
  },
});
