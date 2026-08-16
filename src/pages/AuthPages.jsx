import { useState } from "react";
import { Sun, Moon, Check, ArrowRight, AlertCircle, Timer } from "lucide-react";
import { supabase, signIn as sbSignIn, signUp as sbSignUp, signOut as sbSignOut, createCompany, joinCompany } from "../lib/supabase.js";
import { Card, Btn, Field, Dot } from "../components/ui.jsx";
import { StyleTag } from "../components/StyleTag.jsx";
import renlaLogoWhite from "../assets/renla-logo-white.png";

function NotConfigured({ theme }) {
  return (
    <div style={{ ...theme, fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <StyleTag />
      <Card style={{ maxWidth: 460 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
          <div className="cp-login-mark"><img src={renlaLogoWhite} alt="" width={17} height={19} style={{ display: "block" }} /></div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18 }}>Renla</span>
        </div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, margin: "0 0 10px" }}>Almost there — add your Supabase keys</h3>
        <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: 0 }}>
          Create a file called <b>.env</b> in the project folder with:
        </p>
        <pre style={{ background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 9, padding: 12, fontSize: 12, overflowX: "auto", fontFamily: "var(--font-mono)" }}>
VITE_SUPABASE_URL=https://xxxx.supabase.co{"\n"}VITE_SUPABASE_ANON_KEY=eyJ...
        </pre>
        <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, margin: 0 }}>
          Both are in Supabase under <b>Project Settings → API</b>. Restart the dev server afterwards.
          If you've deployed, add the same two variables in your hosting settings and redeploy.
        </p>
      </Card>
    </div>
  );
}

/* ================================================================== */
/*  SIGN IN / SIGN UP                                                  */
/* ================================================================== */
function AuthShell({ theme, dark, setDark, children, badge, title, blurb }) {
  return (
    <div style={{ ...theme, fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)", minHeight: "100vh" }}>
      <StyleTag />
      <div className="cp-login">
        <div className="cp-login-brand">
          <div className="cp-login-mark"><img src={renlaLogoWhite} alt="" width={17} height={19} style={{ display: "block" }} /></div>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 19, letterSpacing: "-0.02em" }}>Renla</span>
        </div>
        <button className="cp-theme-toggle-login" onClick={() => setDark(!dark)}>
          {dark ? <Sun size={15} /> : <Moon size={15} />} {dark ? "Light" : "Dark"}
        </button>
        <div style={{ maxWidth: 440 }}>
          {badge && <div className="cp-pill"><Dot c="var(--brand)" /> {badge}</div>}
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: 34, lineHeight: 1.08, letterSpacing: "-0.03em", fontWeight: 700, margin: 0 }}>{title}</h1>
          {blurb && <p style={{ color: "var(--muted)", fontSize: 14.5, marginTop: 12, lineHeight: 1.55 }}>{blurb}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

function AuthScreen({ theme, dark, setDark }) {
  const [mode, setMode] = useState("in");
  const [f, setF] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const go = async () => {
    setErr(""); setBusy(true);
    try {
      if (mode === "in") await sbSignIn(f.email, f.password);
      else {
        const res = await sbSignUp(f.email, f.password);
        if (!res.session) { setSent(true); setBusy(false); return; }
      }
      // the auth listener in App picks it up from here
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (sent) {
    return (
      <AuthShell theme={theme} dark={dark} setDark={setDark} badge="Check your inbox"
        title="Confirm your email" blurb={`We've sent a link to ${f.email}. Open it, then come back and sign in.`}>
        <div style={{ marginTop: 20 }}><Btn variant="ghost" onClick={() => { setSent(false); setMode("in"); }}>Back to sign in</Btn></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell theme={theme} dark={dark} setDark={setDark}
      badge={mode === "in" ? "Sign in" : "Create an account"}
      title={mode === "in" ? "Welcome back." : "Let's get you set up."}
      blurb={mode === "in" ? "Use the email and password your HR team gave you." : "Create your login first — you'll name your company on the next screen."}>
      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Email">
          <input className="cp-input" autoFocus type="email" autoComplete="email"
            value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && go()} />
        </Field>
        <Field label="Password">
          <input className="cp-input" type="password"
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && go()} />
        </Field>
        {err && <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", gap: 7, alignItems: "center" }}><AlertCircle size={14} /> {err}</div>}
        <div><Btn icon={busy ? Timer : ArrowRight} disabled={busy} onClick={go}>{busy ? "Just a moment…" : mode === "in" ? "Sign in" : "Create account"}</Btn></div>
      </div>
      <div style={{ marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
        {mode === "in" ? "Setting up a new company? " : "Already have an account? "}
        <button className="cp-link" onClick={() => { setMode(mode === "in" ? "up" : "in"); setErr(""); }}>
          {mode === "in" ? "Create an account" : "Sign in"}
        </button>
      </div>
    </AuthShell>
  );
}

function NewCompany({ theme, dark, setDark, profile }) {
  const [f, setF] = useState({ company: "", name: "", title: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [joinId, setJoinId] = useState("");
  const [tab, setTab] = useState("create");

  const create = async () => {
    if (!f.company.trim() || !f.name.trim()) { setErr("Fill in your company name and your own name."); return; }
    setErr(""); setBusy(true);
    try { await createCompany(f.company.trim(), f.name.trim(), f.title.trim()); window.location.reload(); }
    catch (e) { setErr(e.message); setBusy(false); }
  };

  const join = async () => {
    if (!joinId.trim()) { setErr("Paste the staff code your HR team sent you."); return; }
    setErr(""); setBusy(true);
    try { await joinCompany(joinId.trim()); window.location.reload(); }
    catch (e) { setErr("That code wasn't recognised — check it with your HR team."); setBusy(false); }
  };

  return (
    <AuthShell theme={theme} dark={dark} setDark={setDark} badge={profile.email}
      title="One more step" blurb="Set up a new company, or join one you've been invited to.">
      <div className="cp-tabs" style={{ marginTop: 20 }}>
        <button className={"cp-tab" + (tab === "create" ? " active" : "")} onClick={() => { setTab("create"); setErr(""); }}>Create a company</button>
        <button className={"cp-tab" + (tab === "join" ? " active" : "")} onClick={() => { setTab("join"); setErr(""); }}>Join one</button>
      </div>

      {tab === "create" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Company name"><input className="cp-input" autoFocus value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="e.g. Ade Apparel Ltd" /></Field>
          <Field label="Your full name"><input className="cp-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Your job title"><input className="cp-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Founder" /></Field>
          {err && <div style={{ fontSize: 13, color: "var(--danger)" }}>{err}</div>}
          <div><Btn icon={busy ? Timer : ArrowRight} disabled={busy} onClick={create}>{busy ? "Setting up…" : "Create company"}</Btn></div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>You'll be the HR Admin, with access to everything.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Staff code" hint="Your HR team will send you this">
            <input className="cp-input" autoFocus value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Paste the code here" />
          </Field>
          {err && <div style={{ fontSize: 13, color: "var(--danger)" }}>{err}</div>}
          <div><Btn icon={busy ? Timer : ArrowRight} disabled={busy} onClick={join}>{busy ? "Joining…" : "Join company"}</Btn></div>
        </div>
      )}
      <div style={{ marginTop: 22 }}><button className="cp-link" onClick={() => sbSignOut()}>Sign out</button></div>
    </AuthShell>
  );
}


export { NotConfigured, AuthShell, AuthScreen, NewCompany };
