import { useState, useEffect, useCallback } from "react";
import { Wallet, Copy, Check, AlertCircle, Timer, Landmark, ArrowRight } from "lucide-react";
import { myBilling, raiseBillingRequest } from "../lib/supabase.js";
import { naira, copyText } from "../lib/format.js";
import { Card, Btn, Field, Section, PageHead, Empty, Badge, Stat, Modal } from "../components/ui.jsx";

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
  const [asking, setAsking] = useState(null);     // term key being requested

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
  const monthsCovered = monthly > 0 ? Math.floor(balance / monthly) : null;
  const inArrears = balance < 0;
  const ref = payRef(b.companyId, b.companyName);
  const openReq = (b.requests || []).find((r) => r.status === "open");

  return (
    <div className="cp-fade">
      <PageHead title="Billing" sub={`${b.planName || b.plan} · ${b.seats} ${b.seats === 1 ? "person" : "people"}`} />

      {inArrears && (
        <Card style={{ marginBottom: 18, borderColor: "var(--danger)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <AlertCircle size={18} style={{ color: "var(--danger)", marginTop: 1, flex: "0 0 auto" }} />
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              <b>{naira(Math.abs(balance))} outstanding.</b> Transfer it using the details below and quote
              the reference — your balance updates once the payment is confirmed.
            </div>
          </div>
        </Card>
      )}

      <div className="cp-tiles" style={{ marginBottom: 18 }}>
        <Stat icon={Wallet} label="Wallet balance" value={naira(balance)}
          sub={inArrears ? "Outstanding" : "Available"} tone={inArrears ? "accent" : "brand"} />
        <Stat icon={Timer} label="Covers" value={monthsCovered === null ? "—" : `${Math.max(0, monthsCovered)} ${monthsCovered === 1 ? "month" : "months"}`}
          sub={monthly > 0 ? `At ${naira(monthly)}/month` : "Free plan"} />
        <Stat icon={Landmark} label="Your plan" value={b.planName || b.plan}
          sub={b.seatCap ? `Up to ${b.seatCap} staff` : "Unlimited staff"} />
        <Stat icon={Check} label="Paid through" value={b.paidThrough ? fmtDate(b.paidThrough) : "—"}
          sub={b.term === "monthly" ? "Billed monthly" : `Billed ${String(b.term)}`} tone="accent" />
      </div>

      {/* How to pay — the part that actually matters on this page. */}
      <Card style={{ marginBottom: 18 }}>
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

      {/* Pay ahead and save */}
      {monthly > 0 && (
        <Card style={{ marginBottom: 18 }}>
          <Section title="Pay ahead and save">
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
              Paying for several months at once costs less. Tell us which you'd like and we'll confirm the
              amount before you transfer anything.
            </div>

            {openReq && (
              <div style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600, marginBottom: 14 }}>
                Request sent — we'll be in touch shortly.
              </div>
            )}

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
                    {!current && (
                      <div style={{ marginTop: 10 }}>
                        <button className="cp-mini" disabled={Boolean(openReq)} onClick={() => setAsking(t)}>
                          <ArrowRight size={13} /> Request
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        </Card>
      )}

      <Card>
        <Section title="Statement">
          {(b.entries || []).length === 0 ? <Empty text="Nothing yet — no payments and no charges." /> : (
            <div className="cp-table-wrap">
              <table className="cp-table">
                <thead><tr><th>Date</th><th>What</th><th>Reference</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                <tbody>
                  {b.entries.map((e) => (
                    <tr key={e.id}>
                      <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{fmtDate(e.createdAt)}</td>
                      <td style={{ fontSize: 13 }}>{e.description}</td>
                      <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{e.reference || "—"}</td>
                      <td className="cp-num" style={{ fontWeight: 600, color: Number(e.amount) < 0 ? "var(--muted)" : "var(--ok)" }}>
                        {Number(e.amount) < 0 ? "−" : "+"}{naira(Math.abs(Number(e.amount)))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </Card>

      {asking && (
        <RequestModal term={asking} monthly={monthly} onClose={() => setAsking(null)}
          onSend={async (note) => {
            try {
              await raiseBillingRequest({ kind: "term_change", term: asking.key, amount: asking.price, note });
              toast("Request sent — we'll confirm the amount with you.");
              setAsking(null);
              await load();
            } catch (e) { toast(e.message, "danger", 9000); }
          }} />
      )}
    </div>
  );
}

function RequestModal({ term, monthly, onClose, onSend }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = monthly * term.periodMonths - Number(term.price);

  return (
    <Modal title={`Switch to ${term.name.toLowerCase()} billing`} onClose={onClose}
      onSubmit={async () => { setBusy(true); await onSend(note.trim()); setBusy(false); }}
      submitDisabled={busy} submitLabel={busy ? "Sending…" : "Send request"}>
      <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
        {term.name} billing for your company is <b>{naira(term.price)}</b>
        {saving > 0 && <> — {naira(saving)} less than paying monthly over the same {term.periodMonths} months</>}.
      </div>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.55 }}>
        Nothing is charged by sending this. We'll confirm the amount — it's based on your headcount today,
        so it can change if you add people before paying — and then you transfer it using the details on
        the billing page.
      </div>
      <Field label="Anything we should know?" hint="Optional">
        <input className="cp-input" value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. we're adding 4 people next month" />
      </Field>
    </Modal>
  );
}
