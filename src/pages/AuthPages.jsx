import { useState } from "react";
import { Sun, Moon, Check, ArrowRight, AlertCircle, Timer, Building2, KeyRound, ChevronLeft, Eye, EyeOff } from "lucide-react";
import { supabase, signIn as sbSignIn, signUp as sbSignUp, signOut as sbSignOut, createCompany, joinCompany, requestPasswordReset, updatePassword } from "../lib/supabase.js";
import { Card, Btn, Field, Dot } from "../components/ui.jsx";
import { StyleTag } from "../components/StyleTag.jsx";
import renlaLogoWhite from "../assets/renla-logo-white.png";

// A password <input> with a show/hide toggle — used everywhere someone
// types a password (sign in, sign up, choosing a new one) so a typo isn't
// only discoverable by getting "wrong password" back after submitting.
// Defaults hidden, same as a plain password field always has; each field
// keeps its own show/hide state rather than sharing one, so revealing the
// "new password" field on the reset screen doesn't also reveal "confirm."
function PasswordInput({ value, onChange, onKeyDown, autoComplete, autoFocus, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="cp-input-wrap">
      <input className="cp-input" type={show ? "text" : "password"} autoComplete={autoComplete}
        autoFocus={autoFocus} placeholder={placeholder} value={value} onChange={onChange} onKeyDown={onKeyDown} />
      <button type="button" className="cp-input-eye" tabIndex={-1}
        onClick={() => setShow((s) => !s)} title={show ? "Hide password" : "Show password"}>
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  );
}

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

function AuthScreen({ theme, dark, setDark, linkError }) {
  const [mode, setMode] = useState("in");
  const [f, setF] = useState({ email: "", password: "" });
  const [busy, setBusy] = useState(false);
  // Pre-fills from an expired/already-used password-reset link (see App.jsx)
  // so it's not a completely silent dead end — previously this failed
  // entirely inside Supabase's own client-side handling before this app's
  // code ever ran, so the person just landed here with no explanation.
  const [err, setErr] = useState(linkError || "");
  const [sent, setSent] = useState(false);
  const [resetSent, setResetSent] = useState(false);

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

  const sendReset = async () => {
    if (!f.email.trim()) { setErr("Enter the email you sign in with first."); return; }
    setErr(""); setBusy(true);
    try { await requestPasswordReset(f.email); setResetSent(true); }
    catch (e) { setErr(e.message); }
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

  if (mode === "forgot") {
    if (resetSent) {
      return (
        <AuthShell theme={theme} dark={dark} setDark={setDark} badge="Check your inbox"
          title="Reset link sent" blurb={`We've sent a password reset link to ${f.email}. Open it on this device to choose a new password.`}>
          <div style={{ marginTop: 20 }}><Btn variant="ghost" onClick={() => { setResetSent(false); setMode("in"); setErr(""); }}>Back to sign in</Btn></div>
        </AuthShell>
      );
    }
    return (
      <AuthShell theme={theme} dark={dark} setDark={setDark} badge="Reset password"
        title="Forgot your password?" blurb="Enter the email you sign in with and we'll send you a link to choose a new one.">
        <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Email">
            <input className="cp-input" autoFocus type="email" autoComplete="email"
              value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && !busy && sendReset()} />
          </Field>
          {err && <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", gap: 7, alignItems: "center" }}><AlertCircle size={14} /> {err}</div>}
          <div><Btn icon={busy ? Timer : ArrowRight} disabled={busy} onClick={sendReset}>{busy ? "Sending…" : "Send reset link"}</Btn></div>
        </div>
        <div style={{ marginTop: 20, fontSize: 13, color: "var(--muted)" }}>
          <button className="cp-link" onClick={() => { setMode("in"); setErr(""); }}>Back to sign in</button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell theme={theme} dark={dark} setDark={setDark}
      badge={mode === "in" ? "Sign in" : "Create an account"}
      title={mode === "in" ? "Welcome back." : "Let's get you set up."}
      blurb={mode === "in" ? "Use the email and password your HR team gave you." : "Create your login first — next you'll choose whether to set up a new company or join one you've already been invited to (with a staff code from your HR team)."}>
      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Email">
          <input className="cp-input" autoFocus type="email" autoComplete="email"
            value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && !busy && go()} />
        </Field>
        <Field label="Password">
          <PasswordInput
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && !busy && go()} />
        </Field>
        {mode === "in" && (
          <div style={{ textAlign: "right", marginTop: -6 }}>
            <button className="cp-link" style={{ fontSize: 12.5 }} onClick={() => { setMode("forgot"); setErr(""); }}>Forgot password?</button>
          </div>
        )}
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

/* ================================================================== */
/*  RESET PASSWORD — reached after clicking the link from the reset    */
/*  email. App.jsx shows this in place of the normal app whenever a    */
/*  PASSWORD_RECOVERY auth event has fired, so it can't be skipped.    */
/* ================================================================== */
function ResetPasswordScreen({ theme, dark, setDark, onDone }) {
  const [f, setF] = useState({ password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const go = async () => {
    setErr("");
    if (f.password.length < 6) { setErr("Your password needs to be at least 6 characters."); return; }
    if (f.password !== f.confirm) { setErr("Those passwords don't match."); return; }
    setBusy(true);
    try { await updatePassword(f.password); setDone(true); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  if (done) {
    return (
      <AuthShell theme={theme} dark={dark} setDark={setDark} badge="All set"
        title="Password updated" blurb="You're signed in with your new password.">
        <div style={{ marginTop: 20 }}><Btn icon={ArrowRight} onClick={onDone}>Continue to Renla</Btn></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell theme={theme} dark={dark} setDark={setDark} badge="Reset password"
      title="Choose a new password" blurb="Pick something you haven't used before on this account.">
      <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="New password">
          <PasswordInput autoFocus autoComplete="new-password"
            value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && !busy && go()} />
        </Field>
        <Field label="Confirm new password">
          <PasswordInput autoComplete="new-password"
            value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && !busy && go()} />
        </Field>
        {err && <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", gap: 7, alignItems: "center" }}><AlertCircle size={14} /> {err}</div>}
        <div><Btn icon={busy ? Timer : ArrowRight} disabled={busy} onClick={go}>{busy ? "Saving…" : "Save new password"}</Btn></div>
      </div>
    </AuthShell>
  );
}

function NewCompany({ theme, dark, setDark, profile }) {
  const [f, setF] = useState({ company: "", name: "", title: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [joinId, setJoinId] = useState("");
  // Was previously a tab bar defaulting to "create," which made it easy to
  // miss "Join one" entirely — someone with a staff code from HR could land
  // here and just start typing into the already-active "create" tab without
  // ever noticing there was another option. Now neither path is picked for
  // them: this starts at null (an explicit either/or choice, no default)
  // and only shows a form once they've actually chosen one.
  const [choice, setChoice] = useState(null); // null | "create" | "join"

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

  const back = () => { setChoice(null); setErr(""); };

  if (choice === null) {
    return (
      <AuthShell theme={theme} dark={dark} setDark={setDark} badge={profile.email}
        title="One more step" blurb="Have a staff code from your HR team? You're joining a company they've already set up. Otherwise, you're setting one up for the first time.">
        <div className="cp-choice-row" style={{ marginTop: 22 }}>
          <button className="cp-choice-card" onClick={() => setChoice("create")}>
            <span className="cp-choice-ic"><Building2 size={19} /></span>
            <span className="cp-choice-title">Set up a new company</span>
            <span className="cp-choice-desc">You're the first person here — you'll be the HR Admin, with access to everything.</span>
          </button>
          <button className="cp-choice-card" onClick={() => setChoice("join")}>
            <span className="cp-choice-ic"><KeyRound size={19} /></span>
            <span className="cp-choice-title">Join a company</span>
            <span className="cp-choice-desc">Your HR team sent you a staff code — use it to join the company they've already set up.</span>
          </button>
        </div>
        <div style={{ marginTop: 22 }}><button className="cp-link" onClick={() => sbSignOut()}>Sign out</button></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell theme={theme} dark={dark} setDark={setDark} badge={profile.email}
      title={choice === "create" ? "Set up your company" : "Join your company"}
      blurb={choice === "create" ? "You'll be the HR Admin, with access to everything." : "Your HR team will send you this code."}>
      <button className="cp-link" style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 18, fontSize: 12.5 }} onClick={back}>
        <ChevronLeft size={13} /> Choose differently
      </button>
      {choice === "create" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
          <Field label="Company name"><input className="cp-input" autoFocus value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} placeholder="e.g. Ade Apparel Ltd" /></Field>
          <Field label="Your full name"><input className="cp-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Your job title"><input className="cp-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Founder" /></Field>
          {err && <div style={{ fontSize: 13, color: "var(--danger)" }}>{err}</div>}
          <div><Btn icon={busy ? Timer : ArrowRight} disabled={busy} onClick={create}>{busy ? "Setting up…" : "Create company"}</Btn></div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
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


export { NotConfigured, AuthShell, AuthScreen, NewCompany, ResetPasswordScreen };
