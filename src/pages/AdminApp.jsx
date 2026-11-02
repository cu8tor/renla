import { useState, useEffect } from "react";
import { ShieldCheck, ArrowRight, Timer, AlertCircle, LogOut, Sun, Moon } from "lucide-react";
import { signIn as sbSignIn, signOut as sbSignOut, isPlatformAdmin, getSession } from "../lib/supabase.js";
import { StyleTag } from "../components/StyleTag.jsx";
import AdminPage from "./AdminPage.jsx";

/* =====================================================================
   AdminApp — Renla's back office at /admin.

   Deliberately NOT the customer app. Its own sign-in, its own chrome,
   no sidebar full of Attendance and Leave, and no requirement that the
   account belongs to a company — being Renla is not a role inside a
   customer's business, so it shouldn't need a pretend employer.

   It lives in the same deployment because the alternative is a second
   app, a second build and a second set of Supabase keys to keep in
   step, for one page. Sharing the origin costs nothing here: the gate
   is in the database, not in this file. Every admin_* RPC checks
   platform_admins before it returns a row, so reaching this URL — or
   editing the JavaScript that renders it — gets you an empty table and
   a permission error, not somebody's payroll.
   ===================================================================== */

export default function AdminApp({ theme, dark, setDark }) {
  const [state, setState] = useState("checking");   // checking | out | denied | in | notset
  const [email, setEmail] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      const session = await getSession();
      if (!alive) return;
      if (!session) { setState("out"); return; }
      setEmail(session.user?.email || "");
      try {
        const ok = await isPlatformAdmin();
        if (!alive) return;
        setState(ok ? "in" : "denied");
      } catch (e) {
        // The database doesn't have the admin tables yet. Say that,
        // rather than telling someone they aren't an admin when the
        // question has never been asked of anything.
        if (!alive) return;
        setState(e.notInstalled ? "notset" : "denied");
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state === "checking") {
    return (
      <Chrome theme={theme} dark={dark} setDark={setDark}>
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13.5, paddingTop: 60 }}>
          <div className="cp-spin" /><div style={{ marginTop: 14 }}>Checking…</div>
        </div>
      </Chrome>
    );
  }

  if (state === "out") {
    return <AdminLogin theme={theme} dark={dark} setDark={setDark}
      onIn={async () => {
        const ok = await isPlatformAdmin();
        const s = await getSession();
        setEmail(s?.user?.email || "");
        setState(ok ? "in" : "denied");
      }} />;
  }

  if (state === "notset") {
    return (
      <Chrome theme={theme} dark={dark} setDark={setDark} email={email}
        onSignOut={async () => { await sbSignOut(); setState("out"); }}>
        <div style={{ maxWidth: 480, margin: "60px auto 0", textAlign: "center" }}>
          <AlertCircle size={26} style={{ color: "var(--warn)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "14px 0 8px" }}>Not set up yet</h2>
          <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
            This database doesn't have the admin tables. Run <b>catch-up-migration-14.sql</b> in the
            Supabase SQL editor, then reload — it creates the plans, the wallet ledger and the admin
            list, and adds you to it.
          </p>
        </div>
      </Chrome>
    );
  }

  if (state === "denied") {
    return (
      <Chrome theme={theme} dark={dark} setDark={setDark}>
        <div style={{ maxWidth: 460, margin: "60px auto 0", textAlign: "center" }}>
          <AlertCircle size={26} style={{ color: "var(--danger)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, margin: "14px 0 8px" }}>Not a Renla admin</h2>
          <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>
            <b>{email}</b> is signed in, but isn't on the platform admin list. Add this account with the
            statement at the bottom of <b>catch-up-migration-14.sql</b>, or sign in with an account that
            is. If you meant to open your own company's Renla, the main app is that way.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 20 }}>
            <button className="cp-btn cp-btn-ghost cp-btn-md" onClick={async () => { await sbSignOut(); setState("out"); }}>
              <LogOut size={15} /> Sign out
            </button>
            <button className="cp-btn cp-btn-primary cp-btn-md" onClick={() => window.location.replace("/dashboard")}>
              Go to the app
            </button>
          </div>
        </div>
      </Chrome>
    );
  }

  return (
    <Chrome theme={theme} dark={dark} setDark={setDark} email={email}
      onSignOut={async () => { await sbSignOut(); setState("out"); }}>
      <AdminPage />
    </Chrome>
  );
}

/* The back office's own frame. A dark bar across the top rather than the
   customer app's sidebar, so there is never a moment's doubt about which
   of the two you're looking at — the thing most likely to go wrong here
   is doing something to a customer while thinking you're in your own
   company's account. */
function Chrome({ theme, dark, setDark, email, onSignOut, children }) {
  return (
    <div style={{ ...theme, fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh" }}>
      <StyleTag />
      <header style={{
        background: "#0f2d22", color: "#fff", padding: "0 20px", height: 56,
        display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 20,
      }}>
        <ShieldCheck size={18} style={{ flex: "0 0 auto" }} />
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.01em" }}>
          Renla admin
        </span>
        <span style={{ fontSize: 12, opacity: 0.6 }}>platform</span>
        <div style={{ flex: 1 }} />
        {email && <span style={{ fontSize: 12.5, opacity: 0.8 }}>{email}</span>}
        <button onClick={() => setDark(!dark)} title={dark ? "Light" : "Dark"}
          style={{ background: "transparent", border: 0, color: "#fff", opacity: 0.8, cursor: "pointer", display: "flex", padding: 6 }}>
          {dark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
        {onSignOut && (
          <button onClick={onSignOut} title="Sign out"
            style={{ background: "transparent", border: 0, color: "#fff", opacity: 0.8, cursor: "pointer", display: "flex", padding: 6 }}>
            <LogOut size={15} />
          </button>
        )}
      </header>
      <main style={{ padding: "24px 20px 60px", maxWidth: 1180, margin: "0 auto" }}>{children}</main>
    </div>
  );
}

function AdminLogin({ theme, dark, setDark, onIn }) {
  const [f, setF] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    if (!f.email.trim() || !f.password) { setErr("Email and password, please."); return; }
    setErr(""); setBusy(true);
    try {
      await sbSignIn(f.email, f.password);
      await onIn();
    } catch (e) {
      setErr(e.message || "Couldn't sign in.");
      setBusy(false);
    }
  };

  return (
    <Chrome theme={theme} dark={dark} setDark={setDark}>
      <div style={{ maxWidth: 380, margin: "48px auto 0" }}>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
          Sign in
        </h1>
        <p style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 8, lineHeight: 1.55 }}>
          Renla staff only. This isn't the way into your own company's account — that's at the main app.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 22 }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Email</span>
            <input className="cp-input" autoFocus type="email" autoComplete="username"
              value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) go(); }} />
          </label>

          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>Password</span>
            <input className="cp-input" type="password" autoComplete="current-password"
              value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy) go(); }} />
          </label>

          {err && (
            <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
              <AlertCircle size={14} style={{ marginTop: 1, flex: "0 0 auto" }} /> <span>{err}</span>
            </div>
          )}

          <div>
            <button className="cp-btn cp-btn-primary cp-btn-md" disabled={busy} onClick={go}>
              {busy ? <Timer size={16} /> : <ArrowRight size={16} />}
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </Chrome>
  );
}
