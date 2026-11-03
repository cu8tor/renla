import { useState, useEffect, useCallback } from "react";
import { Copy, Check, AlertCircle, Landmark, TrendingDown, CreditCard, Timer } from "lucide-react";
import { myBilling, raiseBillingRequest, startCardPayment } from "../lib/supabase.js";
import { billingStatus, coveredUntil } from "../features/billing/status.js";
import Statement from "../components/Statement.jsx";
import { naira, copyText } from "../lib/format.js";
import { Card, Btn, Field, Section, PageHead, Empty, Badge, Modal } from "../components/ui.jsx";

/* =====================================================================
   BillingPage — what a customer can see about what they're paying.

   Everything comes from one my_billing() call, which checks that the
   caller is HR of the company it's returning. An ordinary employee has
   no business reading what their employer pays, and this is the only
   route to it.

   The page's real job isn't the numbers — it's making it obvious how to
   pay. Payment is a bank transfer somebody matches up by hand, so the
   account details and the reference to quote matter more here than any
   amount does.
   ===================================================================== */

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/* A short, stable, human-readable reference. The company's own id would
   work but nobody types a UUID into a banking app correctly — this is
   the first chunk, which is plenty to identify six or six hundred
   companies, and it's stable so repeat transfers match. */
const payRef = (companyId, name) =>
  `RENLA-${String(name || "").replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase()}-${String(companyId).slice(0, 6).toUpperCase()}`;

function CopyRow({ label, value, toast }) {
  if (!value) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
      <span style={{ fontSize: 12.5, color: "var(--muted)", minWidth: 120 }}>{label}</span>
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{value}</span>
      <button className="cp-mini" onClick={async () => {
        const ok = await copyText(value);
        toast(ok ? `${label} copied` : `Couldn't copy — it's ${value}`, ok ? "ok" : "danger", ok ? 3000 : 9000);
      }}><Copy size={13} /></button>
    </div>
  );
}

export default function BillingPage({ toast }) {
  const [b, setB] = useState(null);
  const [err, setErr] = useState("");
  const [paying, setPaying] = useState(null);    // null | "card" | "transfer"

  // Set while we're waiting for Paystack's webhook to land after a
  // redirect back from checkout.
  const [settling, setSettling] = useState(() => {
    try { return new URLSearchParams(window.location.search).get("ref") || ""; }
    catch { return ""; }
  });

  const load = useCallback(async () => {
    try {
      const next = await myBilling();
      setB(next);
      return next;
    } catch (e) { setErr(e.message || "Couldn't load billing."); return null; }
  }, []);

  useEffect(() => { load(); }, [load]);

  /* Coming back from Paystack, the webhook has usually landed already —
     but "usually" isn't good enough when the alternative is a customer
     who just paid being shown their old balance and concluding it didn't
     work. So we wait for the ledger to catch up rather than guessing.

     The payment is safe either way: it settles from Paystack's signed
     webhook whether or not this tab is open. All this does is avoid
     telling someone nothing happened when something did. */
  useEffect(() => {
    if (!settling) return;
    let alive = true;
    let tries = 0;

    const clearRef = () => {
      try {
        const u = new URL(window.location.href);
        u.searchParams.delete("ref");
        window.history.replaceState({}, "", u.toString());
      } catch { /* history blocked; harmless */ }
    };

    const tick = async () => {
      if (!alive) return;
      tries += 1;
      const next = await load();
      const hit = (next?.cardAttempts || []).find((a) => a.reference === settling);

      if (hit?.status === "paid") {
        if (!alive) return;
        setSettling(""); clearRef();
        toast(`Payment received — ${naira(hit.amount)} is in your wallet.`);
        return;
      }
      if (hit?.status === "failed") {
        if (!alive) return;
        setSettling(""); clearRef();
        toast("That payment didn't go through. Nothing was charged.", "warn", 8000);
        return;
      }
      // ~30 seconds, then stop pestering the server and say so honestly.
      if (tries >= 10) {
        if (!alive) return;
        setSettling(""); clearRef();
        toast("Still confirming with Paystack. Refresh in a moment — nothing is lost.", "warn", 9000);
        return;
      }
      setTimeout(tick, 3000);
    };

    const t = setTimeout(tick, 1200);
    return () => { alive = false; clearTimeout(t); };
  }, [settling, load, toast]);

  if (err) {
    return (
      <div className="cp-fade" style={{ maxWidth: 560 }}>
        <PageHead title="Billing" />
        <Card>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertCircle size={18} style={{ color: "var(--danger)", marginTop: 1, flex: "0 0 auto" }} />
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{err}</div>
          </div>
        </Card>
      </div>
    );
  }

  if (!b) return <div className="cp-fade"><PageHead title="Billing" /><Card><Empty text="Loading…" /></Card></div>;

  const monthly = Number(b.monthlyCharge) || 0;
  const balance = Number(b.balance) || 0;
  const ref = payRef(b.companyId, b.companyName);
  const openReq = (b.requests || []).find((r) => r.status === "open");

  return (
    <div className="cp-fade">
      <PageHead title="Billing" sub={`${b.planName || b.plan} · ${b.seats} ${b.seats === 1 ? "person" : "people"}`} />

      {settling && (
        <Card style={{ marginBottom: 18, borderColor: "var(--brand)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Timer size={17} style={{ color: "var(--brand)", flex: "0 0 auto" }} />
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              <b>Confirming your payment with Paystack.</b> This usually takes a few seconds — you can
              leave this page, your wallet will be credited either way.
            </div>
          </div>
        </Card>
      )}

      {/* Where you stand, and the two ways to do something about it.
          The bank details used to sit here permanently; they only matter
          once somebody has chosen to transfer, so they live inside that
          flow now. */}
      <StatusCard b={b} monthly={monthly} balance={balance} />

      <Card style={{ margin: "18px 0" }}>
        <Section title="Add money to your wallet">
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
            Pick how long you want to cover, then how you'd like to pay.
          </div>

          {openReq && (
            <div style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600, marginBottom: 14, lineHeight: 1.55 }}>
              {naira(openReq.amount)} awaiting confirmation{openReq.receiptPath ? " — receipt received" : ""}.
            </div>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Btn icon={CreditCard} onClick={() => setPaying("card")}>Pay by card</Btn>
            <Btn icon={Landmark} variant="ghost" disabled={Boolean(openReq)} onClick={() => setPaying("transfer")}>
              Pay by bank transfer
            </Btn>
          </div>

          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.6 }}>
            Card goes through Paystack — you can pay by card, transfer or USSD there, and your wallet is
            credited in seconds. A transfer straight to our account is checked by hand, so it lands on
            your balance by the next working day.
          </div>
        </Section>
      </Card>
      <Card>
        <Section title="Statement" action={<WalletBalance balance={balance} />}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.55 }}>
            Every charge and payment, newest first. The last column is what your balance stood at
            after that line.
          </div>
          <Statement entries={b.entries} />
        </Section>
      </Card>

      {paying && (
        <PayModal
          how={paying}
          b={b}
          monthly={monthly}
          outstanding={balance < 0 ? Math.abs(balance) : 0}
          payRef={ref}
          toast={toast}
          onClose={() => setPaying(null)}
          onSent={async () => { setPaying(null); await load(); }}
        />
      )}
    </div>
  );
}

/* The one thing a customer came here to find out: am I fine, and do I
   owe anything?

   This used to be four tiles — balance, months covered, plan, paid
   through — and ₦0 looked identical whether it meant "up to date" or
   "about to be cut off". One card, one verdict, one number. */
export function StatusCard({ b, monthly, balance }) {
  const st = billingStatus({ balance, monthly });
  /* Worked out from the balance rather than read from companies.paid_through:
     a stored date is a promise the wallet can't keep once headcount moves. */
  const covered = coveredUntil({ balance, monthly });

  const COLOUR = {
    danger: ["var(--danger)", "var(--danger-soft)"],
    warn:   ["var(--warn)",   "var(--warn-soft)"],
    ok:     ["var(--ok)",     "var(--ok-soft)"],
    muted:  ["var(--muted)",  "var(--card2)"],
  };
  const [fg, soft] = COLOUR[st.tone] || COLOUR.muted;

  const Icon = st.state === "behind" ? AlertCircle
    : st.state === "thin" || st.state === "due" ? TrendingDown
    : st.state === "free" ? Landmark : Check;

  const detail =
    st.state === "behind"
      ? `Transfer ${naira(st.owed)} using the details below, then tell us — your balance updates once we've matched it against the bank.`
    : st.state === "due"
      ? `Your next monthly charge of ${naira(monthly)} will put you behind. Top up to stay ahead of it.`
    : st.state === "thin"
      ? `That's under one month at ${naira(monthly)} a month. Worth topping up before the next charge.`
    : st.state === "ahead"
      ? `About ${st.monthsAhead} ${st.monthsAhead === 1 ? "month" : "months"} of credit at ${naira(monthly)} a month. Add staff beyond your included seats and it runs down sooner.`
      : `The ${b.planName || b.plan} plan has no monthly charge.`;

  return (
    <Card style={{ borderColor: st.state === "behind" ? "var(--danger)" : "var(--line)" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <span className="cp-stat-ic" style={{ background: soft, color: fg, flex: "0 0 auto" }}>
          <Icon size={17} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", color: fg }}>{st.headline}</div>

          <div style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.65, maxWidth: 560, marginTop: 7 }}>{detail}</div>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            <Fact label="Plan" value={b.planName || b.plan} />
            <Fact label="Charged" value={monthly > 0 ? `${naira(monthly)} / month` : "Nothing"} />
            <Fact label="Staff counted" value={`${b.seats}${b.seatCap ? ` of ${b.seatCap}` : ""}`} />
            {covered && <Fact label="Covered until" value={`about ${fmtDate(covered)}`} />}
          </div>
        </div>
      </div>
    </Card>
  );
}

/* The wallet balance belongs to the statement, not to the status card:
   it is the figure the running-balance column arrives at, so showing it
   anywhere else means the same number in two places with two chances to
   disagree. */
function WalletBalance({ balance }) {
  const n = Number(balance) || 0;
  const colour = n < 0 ? "var(--danger)" : n > 0 ? "var(--ok)" : "var(--ink)";
  return (
    <div style={{ textAlign: "right", flex: "0 0 auto" }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 1 }}>Wallet balance</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 23, fontWeight: 600, letterSpacing: "-0.02em", color: colour, lineHeight: 1.1 }}>
        {n < 0 ? "−" : ""}{naira(Math.abs(n))}
      </div>
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/* =====================================================================
   PayModal — choose how much, then pay.

   One dialog for both routes, because the decision is the same one:
   how long do you want to cover? Only the second half differs, and
   splitting it into two dialogs meant two places to keep the term
   prices right.

   The bank details live in the transfer branch rather than on the page.
   An account number on permanent display is noise to everybody who
   isn't transferring today, and most people aren't.
   ===================================================================== */
function PayModal({ how, b, monthly, outstanding, payRef: ref, toast, onClose, onSent }) {
  const terms = (b.terms || []).filter((t) => t.key !== "monthly");
  const monthlyTerm = (b.terms || []).find((t) => t.key === "monthly");

  /* Options are the real terms, so the saving shown is the saving given.
     Anything hand-rolled here would drift from what the database does on
     settlement. */
  /* What a term actually buys is credit, not time. Pay ₦50,000 and
     ₦60,000 lands in the wallet; the monthly charge then eats it at
     whatever rate your headcount sets. Selling it as "twelve months"
     was a promise that broke the moment somebody hired. */
  const options = [
    ...(monthlyTerm ? [{ ...monthlyTerm, credit: Number(monthlyTerm.price), saving: 0 }] : []),
    ...terms.map((t) => {
      const credit = monthly * t.periodMonths;
      return { ...t, credit, saving: Math.max(0, credit - Number(t.price)) };
    }),
  ];

  const [choice, setChoice] = useState(options[0]?.key || "");
  const [custom, setCustom] = useState("");
  const [step, setStep] = useState("choose");     // choose | details
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const picked = options.find((o) => o.key === choice) || null;
  const customAmount = Number(String(custom).replace(/[^0-9.]/g, ""));
  const amount = choice === "custom" ? customAmount : Number(picked?.price || 0);
  // A term only applies when they picked one. Monthly is the default
  // state rather than something you buy, and a custom amount is a
  // top-up — neither should move the paid-through date.
  const term = choice === "custom" || choice === "monthly" ? null : choice;

  const goCard = async () => {
    if (!(amount > 0)) { setErr("How much do you want to pay?"); return; }
    if (amount < 100) { setErr("The smallest card payment is ₦100."); return; }
    setErr(""); setBusy(true);
    try {
      const { url } = await startCardPayment(amount, term);
      window.location.replace(url);
    } catch (e) { setErr(e.message || "Couldn't start that payment."); setBusy(false); }
  };

  const sendTransfer = async () => {
    if (!(amount > 0)) { setErr("How much did you transfer?"); return; }
    setErr(""); setBusy(true);
    try {
      await raiseBillingRequest({
        kind: term ? "term_change" : "topup",
        term, amount, note: note.trim(), receipt,
      });
      toast("Thanks — we'll check the bank and update your balance.");
      await onSent();
    } catch (e) { setErr(e.message || "Couldn't send that."); setBusy(false); }
  };

  /* ---------- step one: how much ---------- */
  if (step === "choose") {
    return (
      <Modal
        title={how === "card" ? "Pay by card" : "Pay by bank transfer"}
        onClose={onClose}
        onSubmit={() => {
          if (!(amount > 0)) { setErr("Pick how long you want to cover."); return; }
          setErr("");
          if (how === "card") goCard(); else setStep("details");
        }}
        submitDisabled={busy}
        submitLabel={busy ? "Opening Paystack…" : how === "card" ? "Continue to Paystack" : "Show me where to send it"}>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {monthly > 0 && (
            <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55, marginBottom: 4 }}>
              Your wallet is charged {naira(monthly)} a month at today's headcount. Paying for longer
              buys more credit at a lower rate — it doesn't fix a date, so adding staff beyond your
              included seats uses it up sooner.
            </div>
          )}

          {outstanding > 0 && (
            <div style={{ fontSize: 12.5, color: "var(--danger)", lineHeight: 1.55, marginBottom: 2 }}>
              You're {naira(outstanding)} behind. Anything you pay clears that first.
            </div>
          )}

          {options.map((o) => {
            const on = choice === o.key;
            return (
              <button key={o.key} type="button" onClick={() => { setChoice(o.key); setErr(""); }}
                style={{
                  textAlign: "left", cursor: "pointer", width: "100%",
                  border: `1px solid ${on ? "var(--brand)" : "var(--line)"}`,
                  background: on ? "var(--brand-soft)" : "var(--card)",
                  borderRadius: 12, padding: "12px 14px", font: "inherit", color: "inherit",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{o.name}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 15 }}>
                    {naira(o.price)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>
                  {o.saving > 0
                    ? <>Puts <b style={{ color: "var(--ink)" }}>{naira(o.credit)}</b> in your wallet
                        for {naira(o.price)} — {o.blurb.toLowerCase()} Saves {naira(o.saving)}.</>
                    : o.blurb}
                </div>
              </button>
            );
          })}

          <button type="button" onClick={() => { setChoice("custom"); setErr(""); }}
            style={{
              textAlign: "left", cursor: "pointer", width: "100%",
              border: `1px solid ${choice === "custom" ? "var(--brand)" : "var(--line)"}`,
              background: choice === "custom" ? "var(--brand-soft)" : "var(--card)",
              borderRadius: 12, padding: "12px 14px", font: "inherit", color: "inherit",
            }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Another amount</span>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3 }}>
              Tops up your wallet. No discount, and it doesn't change your plan.
            </div>
          </button>

          {choice === "custom" && (
            <Field label="Amount (₦)">
              <input className="cp-input" autoFocus inputMode="decimal" value={custom}
                onChange={(e) => setCustom(e.target.value)} placeholder="5000" />
            </Field>
          )}

          {err && (
            <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
              <AlertCircle size={14} style={{ marginTop: 1, flex: "0 0 auto" }} /> <span>{err}</span>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  /* ---------- step two: where to send it ---------- */
  return (
    <Modal title={`Transfer ${naira(amount)}`} onClose={onClose} onSubmit={sendTransfer}
      submitDisabled={busy} submitLabel={busy ? "Sending…" : "I've sent it"}>

      {!b.bank?.account_number ? (
        <Empty text="Renla hasn't published bank details yet. Get in touch at hello@renla.app." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
            Send <b style={{ color: "var(--ink)" }}>{naira(amount)}</b> to the account below and put the
            reference in the narration. That reference is how your transfer gets matched to this
            company, so it matters more than the amount does.
          </div>

          <div>
            <CopyRow label="Bank" value={b.bank.bank_name} toast={toast} />
            <CopyRow label="Account name" value={b.bank.account_name} toast={toast} />
            <CopyRow label="Account number" value={b.bank.account_number} toast={toast} />
            <CopyRow label="Amount" value={String(amount)} toast={toast} />
            <CopyRow label="Reference" value={ref} toast={toast} />
          </div>

          {b.bank.payment_note && (
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>{b.bank.payment_note}</div>
          )}

          <Field label="Receipt" hint="A screenshot or the bank's PDF. Optional, but it's what lets us match your transfer quickly.">
            <input className="cp-input" type="file" accept="image/*,.pdf"
              onChange={(e) => { setReceipt(e.target.files?.[0] || null); setErr(""); }} />
          </Field>
          {receipt && (
            <div style={{ fontSize: 12.5, color: "var(--brand)", fontWeight: 600, marginTop: -6 }}>
              {receipt.name} attached
            </div>
          )}

          <Field label="Anything we should know?" hint="Optional">
            <input className="cp-input" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. transferred from the company account on Monday" />
          </Field>

          {err && (
            <div style={{ fontSize: 13, color: "var(--danger)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
              <AlertCircle size={14} style={{ marginTop: 1, flex: "0 0 auto" }} /> <span>{err}</span>
            </div>
          )}

          <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
            Tell us once you've sent it. Nothing changes on your balance until we've matched it against
            the bank, usually within a working day. Paying by card instead credits you in seconds.
          </div>
        </div>
      )}
    </Modal>
  );
}
