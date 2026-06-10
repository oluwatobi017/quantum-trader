import { useState, useEffect } from "react";
import App from "./App.jsx";

// Install ONE global fetch wrapper that attaches the auth token + owner gate
// to any request hitting our own API (/api or /srv). App's existing fetch
// calls then work unchanged — no edits to the 5,500-line App needed.
(function installAuthFetch() {
  if (typeof window === "undefined" || window.__QT_FETCH_PATCHED) return;
  const orig = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      const isOurApi = url.indexOf("/api/") >= 0 || url.indexOf("/srv/") >= 0;
      if (isOurApi) {
        init = init || {};
        const h = new Headers(init.headers || (typeof input !== "string" && input.headers) || {});
        const auth = window.__QT_AUTH || {};
        if (auth.token) h.set("Authorization", "Bearer " + auth.token);
        if (auth.ownerGate) h.set("x-owner-gate", auth.ownerGate);
        init.headers = h;
      }
    } catch (e) {}
    return orig(input, init);
  };
  window.__QT_FETCH_PATCHED = true;
})();

// ── Auth gate ────────────────────────────────────────────────────────────────
// Wraps the trading app. A visitor must sign up / log in (general account).
// Separately, the OWNER GATE unlocks the owner's server-held testnet keys.
// The token + owner gate are stored in memory and sessionStorage and read by
// App's fetch calls (window.__QT_AUTH).

const C = {
  bg: "#000408", panel: "#071220", border: "#122b52", txt: "#c8dff5",
  sub: "#6b92b8", cyan: "#00e5ff", green: "#00e676", red: "#ff3d5c", dim: "#2d4a6b",
};

function setAuth(token, email) {
  window.__QT_AUTH = window.__QT_AUTH || {};
  window.__QT_AUTH.token = token;
  window.__QT_AUTH.email = email;
  try { sessionStorage.setItem("qt_token", token || ""); sessionStorage.setItem("qt_email", email || ""); } catch (e) {}
}
function setOwnerGate(secret) {
  window.__QT_AUTH = window.__QT_AUTH || {};
  window.__QT_AUTH.ownerGate = secret;
  try { sessionStorage.setItem("qt_owner", secret || ""); } catch (e) {}
}

export default function AuthGate() {
  const [token, setToken] = useState(null);
  const [email, setEmail] = useState("");
  const [mode, setMode] = useState("login"); // login | signup
  const [form, setForm] = useState({ email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [ownerInput, setOwnerInput] = useState("");
  const [ownerOn, setOwnerOn] = useState(false);

  useEffect(function () {
    try {
      const t = sessionStorage.getItem("qt_token");
      const e = sessionStorage.getItem("qt_email");
      const o = sessionStorage.getItem("qt_owner");
      if (t) { setToken(t); setEmail(e || ""); setAuth(t, e || ""); }
      if (o) { setOwnerInput(o); setOwnerGate(o); setOwnerOn(true); }
    } catch (e) {}
  }, []);

  function submit() {
    setErr(""); setBusy(true);
    fetch("/api/" + mode, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        setBusy(false);
        if (!res.ok) { setErr(res.d.error || "Failed"); return; }
        setToken(res.d.token); setEmail(res.d.email); setAuth(res.d.token, res.d.email);
      }).catch(function (e) { setBusy(false); setErr("Network error — try again"); });
  }

  function logout() {
    setToken(null); setAuth("", ""); setOwnerGate("");
    try { sessionStorage.clear(); } catch (e) {}
  }

  // ── Logged in → render the trading app with a thin top auth strip ──
  if (token) {
    return (
      <div>
        <div style={{ background: C.panel, borderBottom: "1px solid " + C.border, padding: "6px 14px", display: "flex", alignItems: "center", gap: 12, fontFamily: "monospace", fontSize: 11, flexWrap: "wrap" }}>
          <span style={{ color: C.cyan, fontWeight: 700 }}>QT</span>
          <span style={{ color: C.sub }}>{email}</span>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: ownerOn ? C.green : C.dim }}>{ownerOn ? "● OWNER UNLOCKED" : "○ owner locked"}</span>
            <input type="password" value={ownerInput} placeholder="owner gate…"
              onChange={function (e) { setOwnerInput(e.target.value); }}
              style={{ background: C.bg, border: "1px solid " + C.border, color: C.txt, padding: "3px 8px", borderRadius: 3, fontSize: 10, width: 120, outline: "none" }} />
            <button onClick={function () { setOwnerGate(ownerInput); setOwnerOn(Boolean(ownerInput)); }}
              style={{ background: "transparent", border: "1px solid " + C.cyan, color: C.cyan, padding: "3px 8px", borderRadius: 3, fontSize: 10, cursor: "pointer" }}>Unlock</button>
            <button onClick={logout} style={{ background: "transparent", border: "1px solid " + C.red, color: C.red, padding: "3px 8px", borderRadius: 3, fontSize: 10, cursor: "pointer" }}>Logout</button>
          </span>
        </div>
        <App />
      </div>
    );
  }

  // ── Logged out → login / signup screen ──
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'IBM Plex Mono',monospace" }}>
      <div style={{ width: 340, maxWidth: "90vw", background: C.panel, border: "1px solid " + C.border, borderRadius: 8, padding: 28 }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.txt }}>QUANTUM <span style={{ color: C.cyan }}>TRADER</span></div>
          <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.15em", marginTop: 2 }}>INSTITUTIONAL ALPHA ENGINE</div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          {["login", "signup"].map(function (m) {
            return (
              <button key={m} onClick={function () { setMode(m); setErr(""); }}
                style={{ flex: 1, padding: "7px 0", background: mode === m ? C.cyan : "transparent", color: mode === m ? C.bg : C.sub, border: "1px solid " + (mode === m ? C.cyan : C.border), borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>
                {m === "login" ? "Log In" : "Sign Up"}
              </button>
            );
          })}
        </div>
        <input type="email" placeholder="email" value={form.email}
          onChange={function (e) { setForm(Object.assign({}, form, { email: e.target.value })); }}
          style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: "1px solid " + C.border, color: C.txt, padding: "10px 12px", borderRadius: 4, fontSize: 12, marginBottom: 10, outline: "none" }} />
        <input type="password" placeholder="password (min 8 chars)" value={form.password}
          onChange={function (e) { setForm(Object.assign({}, form, { password: e.target.value })); }}
          onKeyDown={function (e) { if (e.key === "Enter") submit(); }}
          style={{ width: "100%", boxSizing: "border-box", background: C.bg, border: "1px solid " + C.border, color: C.txt, padding: "10px 12px", borderRadius: 4, fontSize: 12, marginBottom: 14, outline: "none" }} />
        {err ? <div style={{ color: C.red, fontSize: 10, marginBottom: 10 }}>{err}</div> : null}
        <button onClick={submit} disabled={busy}
          style={{ width: "100%", padding: "11px 0", background: C.cyan, color: C.bg, border: "none", borderRadius: 4, fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer", textTransform: "uppercase", opacity: busy ? 0.6 : 1 }}>
          {busy ? "…" : (mode === "login" ? "Log In" : "Create Account")}
        </button>
        <div style={{ fontSize: 8.5, color: C.dim, marginTop: 14, lineHeight: 1.6, textAlign: "center" }}>
          Paper / testnet only. Educational. Not financial advice.<br />Live data &amp; paper simulation for all users.
        </div>
      </div>
    </div>
  );
}
