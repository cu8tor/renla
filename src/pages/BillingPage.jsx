import { useState, useEffect, useCallback } from "react";
import { Wallet, Copy, Check, AlertCircle, Landmark, ArrowRight, TrendingDown } from "lucide-react";
import { myBilling, raiseBillingRequest } from "../lib/supabase.js";
import { billingStatus } from "../features/billing/status.js";
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
  const [funding, setFunding] = useState(null);   // { term } — null term means a plain top-up

  const load = useCallback(async () => {
    try { setB(await myBilling()); }
    catch (e) { setErr(e.message || "Couldn't load billing."); }
  }, []);

  useEffect(() => { load(); }, [load]);

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
  const inArrears = balance < 0;
  const ref = payRef(b.companyId, b.companyName);
  const openReq = (b.requests || []).find((r) => r.status === "open");

  return (
    <div className="cp-fade">
      <PageHead title="Billing" sub={`${b.planName || b.plan} · ${b.seats} ${b.seats === 1 ? "person" : "people"}`} />

      {/* Where you stand and where to send it, on one row — the two
          things somebody opens this page for. They stack below 1080px,
          which is where most of this gets read. */}
      <div className="cp-two-col cp-two-col-even" style={{ marginBottom: 18 }}>
        <StatusCard b={b} monthly={monthly} balance={balance} />

        {/* How to pay — the part that actually matters on this page. */}
        <Card>
        <Section title="How to pay">
          {!b.bank?.account_number ? (
            <Empty text="Renla hasn't published bank details yet. Get in touch at hello@renla.app." />
          ) : (
            <>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 12, lineHeight: 1.55 }}>
                Transfer from your business account and put the reference in the narration. That reference
                is how your transfer gets matched to this company, so it matters more than the amount does.
              </div>
              <CopyRow label="Bank" value={b.bank.bank_name} toast={toast} />
              <CopyRow label="Account name" value={b.bank.account_name} toast={toast} />
              <CopyRow label="Account number" value={b.bank.account_number} toast={toast} />
              <CopyRow label="Reference" value={ref} toast={toast} />
              {b.bank.payment_note && (
                <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 12, lineHeight: 1.55 }}>{b.bank.payment_note}</div>
              )}
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, lineHeight: 1.55 }}>
                Transfers are confirmed by hand, so a payment usually shows up here within a working day
                rather than instantly.
              </div>
            </>
          )}
        </Section>
        </Card>
      </div>

      {/* Fund the wallet. The whole point of this page. */}
      <Card style={{ marginBottom: 18 }}>
        <Section title="Fund your wallet">
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
            Made a transfer? Tell us how much and attach the receipt — we'll confirm it against the bank
            and your balance updates, usually within a working day.
          </div>

          {openReq && (
            <div style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600, marginBottom: 14, lineHeight: 1.55 }}>
              {naira(openReq.amount)} awaiting confirmation{openReq.receiptPath ? " — receipt received" : ""}.
            </div>
          )}

          <Btn icon={Wallet} disabled={Boolean(openReq)} onClick={() => setFunding({ term: null })}>
            I've made a transfer
          </Btn>

          {monthly > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "22px 0 10px" }}>
                Pay ahead and save
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {(b.terms || []).map((t) => {
                  const full = monthly * t.periodMonths;
                  const saving = full - Number(t.price);
                  const current = b.term === t.key;
                  return (
                    <div key={t.key} style={{
                      flex: "1 1 200px", border: `1px solid ${current ? "var(--brand)" : "var(--line)"}`,
                      borderRadius: 12, padding: 14, background: current ? "var(--brand-soft)" : "var(--card2)",
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{t.name}</span>
                        {current && <Badge tone="brand">Current</Badge>}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 19, fontWeight: 700, marginTop: 6 }}>
                        {naira(t.price)}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.5 }}>
                        {t.blurb}{saving > 0 ? ` Saves ${naira(saving)}.` : ""}
                      </div>
                      {t.key !== "monthly" && (
                        <div style={{ marginTop: 10 }}>
                          <button className="cp-mini" disabled={Boolean(openReq)} onClick={() => setFunding({ term: t })}>
                            <ArrowRight size={13} /> Pay this
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
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

      {funding && (
        <FundModal term={funding.term} monthly={monthly} outstanding={inArrears ? Math.abs(balance) : 0}
          onClose={() => setFunding(null)}
          onSend={async ({ amount, note, receipt }) => {
            await raiseBillingRequest({
              kind: funding.term ? "term_change" : "topup",
              term: funding.term?.key ?? null,
              amount, note, receipt,
            });
            toast("Thanks — we'll confirm it against the bank and update your balance.");
            setFunding(null);
            await load();
          }} />
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
      ? `About ${st.monthsAhead} ${st.monthsAhead === 1 ? "month" : "months"} at ${naira(monthly)} a month. Nothing to do.`
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
            {b.paidThrough && <Fact label="Paid through" value={fmtDate(b.paidThrough)} />}
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

/* "I've paid" — the amount they sent and, ideally, the receipt.

   The receipt is optional but pushed, because a bank narration alone
   often isn't enough to tell two transfers apart, and the alternative
   is an email thread. */
function FundModal({ term, monthly, outstanding, onClose, onSend }) {
  const suggested = term ? Number(term.price) : (outstanding || monthly || 0);
  const [amount, setAmount] = useState(suggested ? String(suggested) : "");
  const [note, setNote] = useState("");
  const [receipt, setReceipt] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const n = Number(String(amount).replace(/[^0-9.]/g, ""));
    if (!n || n <= 0) { setErr("How much did you transfer?"); return; }
    setErr(""); setBusy(true);
    try { await onSend({ amount: n, note: note.trim(), receipt }); }
    catch (e) { setErr(e.message || "Couldn't send that."); setBusy(false); }
  };

  return (
    <Modal title={term ? `Pay ${term.name.toLowerCase()}` : "Confirm your transfer"}
      onClose={onClose} onSubmit={submit} submitDisabled={busy}
      submitLabel={busy ? "Sending…" : "Send to Renla"}>

      {term && (
        <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          {term.name} billing for your company is <b>{naira(term.price)}</b>. {term.blurb}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Amount transferred (₦)" hint={term ? "Change it if you sent a different amount" : undefined}>
          <input className="cp-input" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>

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
          This doesn't take any money — it tells Renla to look for your transfer. Nothing changes on your
          balance until it's confirmed against the bank.
        </div>
      </div>
    </Modal>
  );
}
