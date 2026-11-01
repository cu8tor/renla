import { useState, useEffect } from "react";
import { ArrowRight, Timer, AlertCircle, Check } from "lucide-react";
import { inviteDetails, claimInvite, acceptInvite, signIn } from "../lib/supabase.js";
import { AuthShell, PasswordInput } from "./AuthPages.jsx";
import { Field } from "../components/ui.jsx";

/* =====================================================================
   JoinPage — what an invited person sees, and the only thing they
   should have to do.

   The old route stashed the token, dropped them into ordinary signup,
   and left them to meet an email-confirmation round-trip and then a
   "set up a new company, or join one?" question — neither of which
   means anything to someone an employer just added. It also depended on
   the token surviving in localStorage across that round-trip, which it
   frequently didn't: open the confirmation mail in a different browser
   and the invite was simply gone.

   Now the token stays in the URL and never leaves this page. One
   screen: here's who invited you, pick a password, you're in.
   ===================================================================== */

export default function JoinPage({ theme, dark, setDark }) {
  const [token] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("invite") || ""; }
    catch { return ""; }
  });

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState(null);
  const [dead, setDead] = useState("");      // the invite itself is unusable
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");        // something the person can fix

  useEffect(() => {
    if (!token) { setDead("That link is missing its invite code. Ask your HR team to send a new one."); setLoading(false); return; }
    let alive = true;
    (async () => {
      try {
        const d = await inviteDetails(token);
        if (!alive) return;
        if (!d) setDead("That invite has already been used, or was cancelled. Ask your HR team for a new one.");
        else if (d.expired) setDead("That invite has expired. Ask your HR team to send a new one.");
        else setInvite(d);
      } catch (e) {
        if (alive) setDead(e.message || "Couldn't check that invite.");
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [token]);

  const submit = async () => {
    if (pw.length < 8) { setErr("Pick a password of at least 8 characters."); return; }
    if (pw !== pw2) { setErr("Those two passwords don't match."); return; }
    setErr(""); setBusy(true);
    try {
      // 1. Create the login, already confirmed — the invite proved the address.
      const out = await claimInvite(token, pw);

      // 2. Sign in as them. Everything after this runs under their own JWT,
      //    never a privileged key.
      try {
        await signIn(out.email, pw);
      } catch {
        // They already had an account and this isn't its password. Nothing
        // is lost — the invite is still unused and still waiting.
        if (out.existing) {
          setErr("You already have a Renla account with this email. Sign in with your existing password, and the invite will be applied automatically.");
          try { localStorage.setItem("renla.invite", token); } catch { /* storage off */ }
          setBusy(false);
          return;
        }
        throw new Error("Account created, but signing in failed. Try signing in with the password you just chose.");
      }

      // 3. Link them to the company. accept_invite re-checks expiry,
      //    revocation and that the signed-in email matches the invited one.
      await acceptInvite(token);

      // Land on the form asking for what HR actually needs, not the
      // dashboard — a full reload so the app boots with a session.
      window.location.replace("/welcome");
    } catch (e) {
      setErr(e.message || "Something went wrong setting up your account.");
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <AuthShell theme={theme} dark={dark} setDark={setDark}
        title="One moment" blurb="Checking your invite…" />
    );
  }

  if (dead) {
    return (
      <AuthShell theme={theme} dark={dark} setDark={setDark}
        title="This invite can't be used" blurb={dead}>
        <div style={{ marginTop: 22 }}>
          <button className="cp-link" onClick={() => window.location.replace("/")}>Go to sign in</button>
        </div>
      </AuthShell>
    );
  }

  const firstName = (invite.employeeName || "").split(" ")[0];

  return (
    <AuthShell theme={theme} dark={dark} setDark={setDark} badge={invite.email}
      title={firstName ? `Welcome, ${firstName}` : "Welcome"}
      blurb={`${invite.companyName} has set you up on Renla. Pick a password and you're in — this is the only step.`}>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 20 }}>
        <Field label="Create a password" hint="At least 8 characters">
          <PasswordInput value={pw} autoFocus autoComplete="new-password"
            onChange={(e) => setPw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }} />
        </Field>

        <Field label="Confirm password">
          <PasswordInput value={pw2} autoComplete="new-password"
            onChange={(e) => setPw2(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !busy) submit(); }} />
        </Field>

        {err && (
          <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
            <AlertCircle size={14} style={{ marginTop: 1, flex: "0 0 auto" }} /> <span>{err}</span>
          </div>
        )}

        <div>
          <button className="cp-btn cp-btn-primary cp-btn-md" disabled={busy} onClick={submit}>
            {busy ? <Timer size={16} /> : <ArrowRight size={16} />}
            {busy ? "Setting up your account…" : "Set up my account"}
          </button>
        </div>

        <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, display: "flex", gap: 7, alignItems: "flex-start" }}>
          <Check size={13} style={{ marginTop: 2, flex: "0 0 auto" }} />
          <span>You'll sign in as <b>{invite.email}</b>. No confirmation email to wait for.</span>
        </div>
      </div>
    </AuthShell>
  );
}
