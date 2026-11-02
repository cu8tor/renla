import { useState, useEffect, useCallback } from "react";
import { Building2, Users, Wallet, RefreshCw, Plus, ChevronLeft, Timer, AlertCircle, Check, X, FileText } from "lucide-react";
import { adminCompanies, adminCompanyDetail, adminRecordPayment, adminAdjust, adminSetPlan, adminPostCharges, listPlans,
  adminOpenRequests, adminResolveRequest, adminApproveRequest, adminSetBankDetails, platformBankDetails, receiptUrl } from "../lib/supabase.js";
import { naira } from "../lib/format.js";
import { Card, Btn, Field, Section, PageHead, Empty, Badge, Modal, Stat } from "../components/ui.jsx";

/* =====================================================================
   AdminPage — Renla's own view across every customer.

   Not a customer feature. Everything here goes through admin_* RPCs
   that check platform_admins before returning a row, so this page is
   useless to anyone who isn't in that table even if they find the URL.
   That check lives in the database rather than in this file: hiding a
   route only hides it.

   Deliberately read-mostly. The three things it writes — recording a
   payment, correcting a balance, changing a plan — are the three that
   would otherwise mean hand-writing SQL against live customer money.
   ===================================================================== */

const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/* A balance is only alarming in context: ₦0 on the free tier is fine,
   ₦0 on Growth means they stop working shortly. */
function balanceTone(balance, monthlyCharge) {
  if (monthlyCharge <= 0) return "muted";
  if (balance < 0) return "danger";
  if (balance < monthlyCharge) return "warn";
  return "ok";
}

export default function AdminPage() {
  const [rows, setRows] = useState(null);
  const [plans, setPlans] = useState([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [openCo, setOpenCo] = useState(null);     // { id, name } being drilled into
  const [detail, setDetail] = useState(null);
  const [payFor, setPayFor] = useState(null);     // company row we're recording against
  const [requests, setRequests] = useState([]);
  const [approving, setApproving] = useState(null);  // request being approved
  const [bank, setBank] = useState(null);

  const load = useCallback(async () => {
    setBusy(true); setErr("");
    try {
      const [list, p, reqs, bankRow] = await Promise.all([
        adminCompanies(), listPlans(), adminOpenRequests(), platformBankDetails(),
      ]);
      setRows(list);
      setPlans(p);
      setRequests(reqs);
      setBank(bankRow);
    } catch (e) {
      setErr(e.message || "Couldn't load that.");
      setRows([]);
    }
    setBusy(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (co) => {
    setOpenCo(co); setDetail(null);
    try { setDetail(await adminCompanyDetail(co.id)); }
    catch (e) { setErr(e.message); setOpenCo(null); }
  };

  if (err && !rows?.length) {
    return (
      <div className="cp-fade" style={{ maxWidth: 560 }}>
        <PageHead title="Renla admin" />
        <Card>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertCircle size={18} style={{ color: "var(--danger)", marginTop: 1, flex: "0 0 auto" }} />
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              {err}
              <div style={{ color: "var(--muted)", marginTop: 8, fontSize: 12.5 }}>
                This page only works for a Renla platform admin. If that should be you, add your
                user id to <b>platform_admins</b> — catch-up-migration-14.sql has the statement.
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* ---------- one company ---------- */
  if (openCo) {
    const co = rows?.find((r) => r.id === openCo.id) || openCo;
    return (
      <div className="cp-fade">
        <button className="cp-link" style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 14 }}
          onClick={() => { setOpenCo(null); setDetail(null); }}>
          <ChevronLeft size={14} /> All companies
        </button>

        <PageHead title={co.name} sub={co.plan_name || co.plan}
          action={<Btn icon={Plus} onClick={() => setPayFor(co)}>Record payment</Btn>} />

        {!detail ? <Card><Empty text="Loading…" /></Card> : (
          <>
            <div className="cp-tiles" style={{ marginBottom: 18 }}>
              <Stat icon={Wallet} label="Balance" value={naira(detail.balance)}
                sub={detail.monthlyCharge > 0 ? `${naira(detail.monthlyCharge)}/month` : "Free plan"}
                tone={balanceTone(detail.balance, detail.monthlyCharge) === "ok" ? "brand" : "accent"} />
              <Stat icon={Users} label="Employees" value={detail.seats} sub="Active" />
              <Stat icon={Building2} label="Branches" value={detail.branches.length} />
              <Stat icon={Timer} label="Months covered" value={detail.monthlyCharge > 0 ? Math.floor(detail.balance / detail.monthlyCharge) : "—"}
                sub="At the current rate" tone="accent" />
            </div>

            <Card style={{ marginBottom: 18 }}>
              <Section title="Plan">
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 220 }}>
                    <Field label="Subscription plan">
                      <select className="cp-input" value={co.plan}
                        onChange={async (e) => {
                          try { await adminSetPlan(co.id, e.target.value); await load(); await openDetail(co); }
                          catch (x) { setErr(x.message); }
                        }}>
                        {plans.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, flex: 1, minWidth: 240, paddingBottom: 10 }}>
                    Changing this changes what they're charged from the next monthly posting. It doesn't
                    bill them now and doesn't refund anything already charged.
                  </div>
                </div>
              </Section>
            </Card>

            <Card style={{ marginBottom: 18 }}>
              <Section title={`Statement · ${detail.entries.length}`}>
                {detail.entries.length === 0 ? <Empty text="Nothing yet — no payments and no charges." /> : (
                  <div className="cp-table-wrap">
                    <table className="cp-table">
                      <thead><tr><th>Date</th><th>What</th><th>Reference</th><th style={{ textAlign: "right" }}>Amount</th></tr></thead>
                      <tbody>
                        {detail.entries.map((e) => (
                          <tr key={e.id}>
                            <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{fmtDate(e.createdAt)}</td>
                            <td style={{ fontSize: 13 }}>
                              <Badge tone={e.kind === "credit" ? "ok" : e.kind === "charge" ? "muted" : "accent"}>{e.kind}</Badge>
                              <span style={{ marginLeft: 8 }}>{e.description}</span>
                            </td>
                            <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{e.reference || "—"}</td>
                            <td className="cp-num" style={{ color: Number(e.amount) < 0 ? "var(--muted)" : "var(--ok)", fontWeight: 600 }}>
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

            <div className="cp-two-col">
              <Card>
                <Section title={`Employees · ${detail.employees.length}`}>
                  {detail.employees.length === 0 ? <Empty text="Nobody added yet." /> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, maxHeight: 340, overflowY: "auto" }}>
                      {detail.employees.map((e) => (
                        <div key={e.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                          <span style={{ flex: 1, fontWeight: 600 }}>{e.name}</span>
                          <span style={{ color: "var(--muted)", fontSize: 12.5 }}>{e.title || "—"}</span>
                          <Badge tone={e.status === "Active" ? "ok" : "muted"}>{e.status}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>
              </Card>

              <Card>
                <Section title={`Branches · ${detail.branches.length}`}>
                  {detail.branches.length === 0 ? <Empty text="No branches set up." /> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {detail.branches.map((b) => (
                        <div key={b.id} style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</div>
                      ))}
                    </div>
                  )}
                </Section>
              </Card>
            </div>
          </>
        )}

        {payFor && <PaymentModal co={payFor} onClose={() => setPayFor(null)}
          onDone={async () => { setPayFor(null); await load(); await openDetail(co); }}
          onError={setErr} />}
      </div>
    );
  }

  /* ---------- all companies ---------- */
  const totalOwed = (rows || []).reduce((t, r) => t + (Number(r.balance) < 0 ? -Number(r.balance) : 0), 0);
  const totalHeld = (rows || []).reduce((t, r) => t + Math.max(0, Number(r.balance)), 0);
  const paying = (rows || []).filter((r) => Number(r.monthly_charge) > 0);
  const mrr = paying.reduce((t, r) => t + Number(r.monthly_charge), 0);

  return (
    <div className="cp-fade">
      <PageHead title="Renla admin" sub="Every company on the platform"
        action={<Btn icon={RefreshCw} variant="ghost" disabled={busy} onClick={load}>{busy ? "Loading…" : "Refresh"}</Btn>} />

      {err && <Card style={{ marginBottom: 18, borderColor: "var(--danger)" }}><div style={{ fontSize: 13, color: "var(--danger)" }}>{err}</div></Card>}

      <div className="cp-tiles" style={{ marginBottom: 18 }}>
        <Stat icon={Building2} label="Companies" value={(rows || []).length} sub={`${paying.length} on a paid plan`} />
        <Stat icon={Wallet} label="Monthly recurring" value={naira(mrr)} sub="At current headcounts" />
        <Stat icon={Wallet} label="Held in wallets" value={naira(totalHeld)} sub="Paid, not yet used" tone="accent" />
        <Stat icon={AlertCircle} label="In arrears" value={naira(totalOwed)} sub="Owed to you" tone="accent" />
      </div>

      <Card pad={0}>
        {rows === null ? <div style={{ padding: 30 }}><Empty text="Loading…" /></div>
          : rows.length === 0 ? <div style={{ padding: 30 }}><Empty text="No companies yet." /></div> : (
          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead><tr><th>Company</th><th>Plan</th><th>Staff</th><th>Per month</th><th>Balance</th><th>Last paid</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="cp-row" onClick={() => openDetail(r)}>
                    <td style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</td>
                    <td><Badge tone={r.plan === "starter" ? "muted" : "brand"}>{r.plan_name || r.plan}</Badge></td>
                    <td className="cp-num">{r.seats}</td>
                    <td className="cp-num">{Number(r.monthly_charge) > 0 ? naira(r.monthly_charge) : "—"}</td>
                    <td className="cp-num">
                      <Badge tone={balanceTone(Number(r.balance), Number(r.monthly_charge))}>{naira(r.balance)}</Badge>
                    </td>
                    <td style={{ fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtDate(r.last_payment_at)}</td>
                    <td onClick={(ev) => ev.stopPropagation()}>
                      <button className="cp-mini" onClick={() => setPayFor(r)}><Plus size={13} /> Payment</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {requests.length > 0 && (
        <Card style={{ marginTop: 18, borderColor: "var(--accent)" }}>
          <Section title={`Requests · ${requests.length}`}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
              Companies asking to change plan or pay ahead. Nothing has been charged — confirm the amount
              the bank first, then approve — approving credits the wallet and
              closes the claim together.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {requests.map((r) => (
                <div key={r.id} className="cp-leaverow">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.companyName}</span>
                      <Badge tone="accent">{r.term || r.plan || r.kind}</Badge>
                      {r.amount != null && <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{naira(r.amount)}</span>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                      {fmtDate(r.createdAt)}{r.note ? ` · ${r.note}` : ""}
                      {!r.receiptPath && <span style={{ color: "var(--warn)" }}> · no receipt</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                    {r.receiptPath && (
                      <button className="cp-mini" title="View the receipt they attached"
                        onClick={async () => {
                          const u = await receiptUrl(r.receiptPath);
                          if (u) window.open(u, "_blank"); else setErr("Couldn't open that receipt.");
                        }}><FileText size={13} /> Receipt</button>
                    )}
                    <button className="cp-mini" onClick={() => openDetail({ id: r.companyId, name: r.companyName })}>Open</button>
                    <button className="cp-mini cp-mini-ok"
                      title={r.kind === "plan_change" ? "Approve the plan change" : "Credit the wallet and close this claim"}
                      onClick={() => setApproving(r)}>
                      <Check size={13} /> Approve
                    </button>
                    <button className="cp-mini cp-mini-no" title="Decline"
                      onClick={async () => { try { await adminResolveRequest(r.id, "declined"); await load(); } catch (e) { setErr(e.message); } }}>
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </Card>
      )}

      {bank && <BankCard bank={bank} onSaved={load} onError={setErr} />}

      <Card style={{ marginTop: 18 }}>
        <Section title="Monthly billing">
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
            Posts this month's charge against every company on a paid plan, worked out from their plan
            and their current headcount. Safe to run twice — a company already charged for this month is
            skipped, so nobody is ever double-billed. Companies on the free plan are left alone entirely.
          </div>
          <Btn icon={Wallet} disabled={busy} onClick={async () => {
            setBusy(true); setErr("");
            try {
              const n = await adminPostCharges();
              setErr(n === 0 ? "Nothing to post — everyone on a paid plan is already charged for this month."
                             : `Posted ${n} ${n === 1 ? "charge" : "charges"}.`);
              await load();
            } catch (e) { setErr(e.message); }
            setBusy(false);
          }}>Post this month's charges</Btn>
        </Section>
      </Card>

      {payFor && <PaymentModal co={payFor} onClose={() => setPayFor(null)}
        onDone={async () => { setPayFor(null); await load(); }} onError={setErr} />}

      {approving && <ApproveModal req={approving} onClose={() => setApproving(null)}
        onDone={async () => { setApproving(null); await load(); }} onError={setErr} />}
    </div>
  );
}

/* Approving a payment claim.

   The amount is editable and starts at what the customer typed, because
   the customer's number and the bank's number disagree often enough that
   trusting the claim would quietly put wrong money in the ledger. What
   you confirm here is what gets credited. */
function ApproveModal({ req, onClose, onDone, onError }) {
  const money = req.kind !== "plan_change";
  const [amount, setAmount] = useState(req.amount != null ? String(req.amount) : "");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const n = Number(String(amount).replace(/[^0-9.]/g, ""));
    if (money && !(n > 0)) { setErr("How much actually arrived?"); return; }
    setErr(""); setBusy(true);
    try {
      await adminApproveRequest(req.id, money ? n : null, reference.trim());
      await onDone();
    } catch (e) { setErr(e.message); onError?.(e.message); setBusy(false); }
  };

  const claimed = req.amount != null ? Number(req.amount) : null;
  const typed = Number(String(amount).replace(/[^0-9.]/g, ""));
  const differs = money && claimed != null && typed > 0 && typed !== claimed;

  return (
    <Modal title={`Approve — ${req.companyName}`} onClose={onClose} onSubmit={submit}
      submitDisabled={busy}
      submitLabel={busy ? "Posting…" : money ? `Credit ${naira(typed || 0)}` : "Approve"}>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {money ? (
          <>
            <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
              Check the money is in the bank before approving. This credits the
              wallet{req.term ? " and moves their paid-through date forward" : ""} and
              cannot be undone from here — a mistake needs a correction afterwards.
            </div>

            <Field label="Amount to credit (₦)"
              hint={claimed != null ? `They said ${naira(claimed)} — change it if the bank says otherwise` : "What landed in the bank"}>
              <input className="cp-input" autoFocus value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="5000" />
            </Field>

            {differs && (
              <div style={{ fontSize: 12.5, color: "var(--warn)" }}>
                Crediting {naira(typed)}, not the {naira(claimed)} they claimed.
              </div>
            )}

            <Field label="Bank reference" hint="Optional — it's what you'll search for later">
              <input className="cp-input" value={reference}
                onChange={(e) => setReference(e.target.value)} />
            </Field>

            {!req.receiptPath && (
              <div style={{ fontSize: 12.5, color: "var(--warn)" }}>
                No receipt attached, so there's nothing to check this against but the bank.
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>
            Move {req.companyName} to the <b>{req.plan}</b> plan. No money moves —
            their next monthly charge changes.
          </div>
        )}

        {err && <div className="cp-formerr">{err}</div>}
      </div>
    </Modal>
  );
}

/* Where customers are told to send money. Kept in the database rather
   than the repo — an account number has no business in git history, and
   this way changing bank doesn't need a deploy. */
function BankCard({ bank, onSaved, onError }) {
  const [f, setF] = useState({
    bank: bank.bank_name || "", accountName: bank.account_name || "",
    accountNumber: bank.account_number || "", note: bank.payment_note || "",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const incomplete = !f.bank.trim() || !f.accountName.trim() || !f.accountNumber.trim();

  return (
    <Card style={{ marginTop: 18, borderColor: incomplete ? "var(--warn)" : undefined }}>
      <Section title="Your bank details">
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
          {incomplete
            ? "Customers can't pay you until these are filled in — their billing page shows a placeholder instead of an account number."
            : "Shown to every customer on their billing page, with a reference for them to quote."}
        </div>
        <div className="cp-form-grid">
          <Field label="Bank"><input className="cp-input" value={f.bank} onChange={(e) => { setF({ ...f, bank: e.target.value }); setSaved(false); }} placeholder="e.g. GTBank" /></Field>
          <Field label="Account name"><input className="cp-input" value={f.accountName} onChange={(e) => { setF({ ...f, accountName: e.target.value }); setSaved(false); }} /></Field>
          <Field label="Account number"><input className="cp-input" value={f.accountNumber} onChange={(e) => { setF({ ...f, accountNumber: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) }); setSaved(false); }} /></Field>
          <Field label="Note" hint="Optional — shown under the details"><input className="cp-input" value={f.note} onChange={(e) => { setF({ ...f, note: e.target.value }); setSaved(false); }} /></Field>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10, alignItems: "center" }}>
          <Btn icon={busy ? Timer : Check} disabled={busy} onClick={async () => {
            setBusy(true);
            try { await adminSetBankDetails(f); setSaved(true); await onSaved(); }
            catch (e) { onError(e.message); }
            setBusy(false);
          }}>{busy ? "Saving…" : "Save bank details"}</Btn>
          {saved && <span style={{ fontSize: 12.5, color: "var(--ok)", fontWeight: 600 }}>Saved</span>}
        </div>
      </Section>
    </Card>
  );
}

/* Recording a transfer you\'ve seen land in the bank. Kept to the two
   things that matter — how much, and what it was — so it can't become a
   form people skip. */
function PaymentModal({ co, onClose, onDone, onError }) {
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [mode, setMode] = useState("credit");      // credit | adjustment
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    const n = Number(String(amount).replace(/[^0-9.-]/g, ""));
    if (!n) { setErr("How much?"); return; }
    if (mode === "credit" && n <= 0) { setErr("A payment has to be positive. Use a correction to take money off."); return; }
    if (mode === "adjustment" && !note.trim()) { setErr("Say what the correction is for."); return; }
    setErr(""); setBusy(true);
    try {
      if (mode === "credit") await adminRecordPayment(co.id, n, reference.trim(), note.trim());
      else await adminAdjust(co.id, n, note.trim());
      await onDone();
    } catch (e) { setErr(e.message); onError?.(e.message); setBusy(false); }
  };

  return (
    <Modal title={mode === "credit" ? `Record a payment from ${co.name}` : `Correct ${co.name}'s balance`}
      onClose={onClose} onSubmit={submit} submitDisabled={busy}
      submitLabel={busy ? "Saving…" : mode === "credit" ? "Record payment" : "Post correction"}>

      <div className="cp-tabs" style={{ marginBottom: 16 }}>
        <button className={"cp-tab" + (mode === "credit" ? " active" : "")} onClick={() => { setMode("credit"); setErr(""); }}>Payment received</button>
        <button className={"cp-tab" + (mode === "adjustment" ? " active" : "")} onClick={() => { setMode("adjustment"); setErr(""); }}>Correction</button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Amount (₦)" hint={mode === "adjustment" ? "Negative to take money off the balance" : "As it landed in the bank"}>
          <input className="cp-input" autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="5000" />
        </Field>

        {mode === "credit" && (
          <Field label="Bank reference" hint="Optional, but it's what you'll search for later">
            <input className="cp-input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        )}

        <Field label={mode === "credit" ? "Note" : "What is this correction for?"} hint={mode === "credit" ? "Optional" : undefined}>
          <input className="cp-input" value={note} onChange={(e) => setNote(e.target.value)}
            placeholder={mode === "credit" ? "Bank transfer" : "e.g. Refund for double payment in October"} />
        </Field>

        {err && <div style={{ fontSize: 13, color: "var(--danger)", lineHeight: 1.5 }}>{err}</div>}

        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.55 }}>
          This goes onto their statement and can't be edited afterwards — a mistake is fixed with a
          correction in the other direction, so the history stays honest.
        </div>
      </div>
    </Modal>
  );
}
