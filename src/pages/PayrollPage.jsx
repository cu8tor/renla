import { useState } from "react";
import { Users, Wallet, Plus, Check, X, Trash2, Pencil, AlertTriangle, RefreshCw, Eye, Receipt, Banknote } from "lucide-react";
import { amountInWords } from "../features/payroll/payrollEngine.js";
import { durLabel } from "../features/attendance/attendanceLogic.js";
import { naira, fmtShort } from "../lib/format.js";
import { monthKey, monthLabel, monthOptions, ytdFor } from "../lib/payrollHelpers.js";
import { Avatar, Badge, Card, Btn, Stat, Field, Section, PageHead, Empty, Modal } from "../components/ui.jsx";

function PayRow({ label, value, bold, mono = true }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "5px 0", fontSize: 13, fontWeight: bold ? 700 : 400 }}>
      <span style={{ color: bold ? "var(--ink)" : "var(--muted)" }}>{label}</span>
      <span style={{ fontFamily: mono ? "var(--font-mono)" : "inherit", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function SlipLine({ label, value, bold, sub }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 10px", fontSize: 12.5, background: bold ? "var(--card2)" : "transparent", fontWeight: bold ? 700 : 400, borderTop: bold ? "1px solid var(--line)" : "none" }}>
      <span style={{ color: bold ? "var(--ink)" : "var(--muted)" }}>{label}{sub && <span style={{ display: "block", fontSize: 10.5, opacity: .8 }}>{sub}</span>}</span>
      <span style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{value}</span>
    </div>
  );
}

function DetailedSlip({ emp, calc, month, company, ytd }) {
  const D = calc.deductions;
  return (
    <div>
      <div style={{ textAlign: "center", paddingBottom: 14, borderBottom: "2px solid var(--brand)" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em" }}>{company.name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{company.address || "Lagos, Nigeria"}</div>
        <div style={{ display: "inline-block", marginTop: 10, background: "var(--brand-soft)", color: "var(--brand)", fontWeight: 700, fontSize: 12.5, padding: "5px 14px", borderRadius: 100 }}>
          PAYSLIP FOR {monthLabel(month).toUpperCase()}
        </div>
      </div>

      <div className="cp-slip-grid" style={{ marginTop: 16 }}>
        <SlipLine label="Employee name" value={emp.name} />
        <SlipLine label="Staff ID" value={emp.id.slice(-6).toUpperCase()} />
        <SlipLine label="Designation" value={emp.title || "—"} />
        <SlipLine label="Department" value={emp.dept || "—"} />
        <SlipLine label="Date joined" value={fmtShort(emp.joined)} />
        <SlipLine label="Pay period" value={monthLabel(month)} />
        <SlipLine label="Bank" value={emp.bank || "—"} />
        <SlipLine label="Account no." value={emp.acct || "—"} />
        <SlipLine label="RSA PIN" value={emp.pension || "—"} />
        <SlipLine label="TIN" value={emp.tin || "—"} />
        <SlipLine label="NIN" value={emp.nin || "—"} />
        <SlipLine label="BVN" value={emp.bvn || "—"} />
      </div>

      <div className="cp-form-grid" style={{ gap: 16, marginTop: 18 }}>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div className="cp-slip-band ok">EARNINGS</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}><span>Item</span><span>This month · YTD</span></div>
          {[["Basic salary", calc.earnings.basic, ytd.basic], ["Transport allowance", calc.earnings.transport, ytd.transport], ["Bonus / commission", calc.earnings.bonus, ytd.bonus], ["Holiday pay", calc.earnings.holiday, ytd.holiday], ["Sunday pay", calc.earnings.sunday, ytd.sunday], ["Other allowance", calc.earnings.other, ytd.other]].map(([l, v, y]) => (
            <SlipLine key={l} label={l} value={`${naira(v)}  ·  ${naira(y)}`} />
          ))}
          <SlipLine label="GROSS PAY" value={`${naira(calc.gross)}  ·  ${naira(ytd.gross)}`} bold />
        </div>

        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div className="cp-slip-band danger">DEDUCTIONS</div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "5px 10px", fontSize: 10.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}><span>Item</span><span>This month · YTD</span></div>
          {[["PAYE (NTA 2025)", D.paye, ytd.paye], [`Pension (${calc.pensionRate}%)`, D.pension, ytd.pension], ["NHF", D.nhf, ytd.nhf], ["NHIS", D.nhis, ytd.nhis], ["Life insurance", D.lifeIns, ytd.lifeIns], ["Mortgage interest", D.mortgage, ytd.mortgage], ["Loan / advance", D.loan, ytd.loan], ["Lateness", D.lateness, ytd.lateness], ["Absence", D.absence, ytd.absence], ["Other deductions", D.otherDed, ytd.otherDed]].map(([l, v, y]) => (
            <SlipLine key={l} label={l} value={`${naira(v)}  ·  ${naira(y)}`} />
          ))}
          <SlipLine label="TOTAL DEDUCTIONS" value={`${naira(calc.totalDeductions)}  ·  ${naira(ytd.totalDeductions)}`} bold />
        </div>
      </div>

      <div style={{ background: "var(--brand)", color: "#fff", borderRadius: 12, padding: "16px 20px", marginTop: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>NET PAY</span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 23 }}>{naira(calc.net)}</span>
        </div>
        <div style={{ fontSize: 12, opacity: .92, marginTop: 6, fontStyle: "italic" }}>{amountInWords(calc.net)}</div>
      </div>

      <div className="cp-form-grid" style={{ gap: 16, marginTop: 18 }}>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div className="cp-slip-band">ATTENDANCE THIS PERIOD</div>
          <SlipLine label="Working days" value={calc.workingDays} />
          <SlipLine label="Days worked" value={calc.daysWorked} />
          <SlipLine label="Days absent" value={calc.absentDays} />
          <SlipLine label="Paid leave / sick" value={`${calc.leaveDays} / ${calc.sickDays}`} />
          <SlipLine label="Unpaid leave days" value={calc.unpaidDays} />
          <SlipLine label="Lateness" value={`${calc.lateDays} days · ${durLabel(calc.lateMinutes)}`} />
          <SlipLine label="Daily rate" value={naira(calc.dailyRate)} />
        </div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
          <div className="cp-slip-band">EMPLOYER CONTRIBUTIONS</div>
          <SlipLine label="Employer pension" value={naira(calc.employer.pension)} />
          <SlipLine label="NSITF" value={naira(calc.employer.nsitf)} />
          <SlipLine label="ITF" value={naira(calc.employer.itf)} />
          <SlipLine label="Total employer cost" value={naira(calc.gross + calc.employer.total)} bold />
          <div style={{ padding: "8px 10px", fontSize: 10.5, color: "var(--muted)", lineHeight: 1.45 }}>
            Paid by the company, not deducted from your salary.
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16, background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, padding: 14 }}>
        <div className="cp-slip-head">PAYE working (NTA 2025)</div>
        <div className="cp-slip-grid">
          <SlipLine label="Annual gross" value={naira(calc.annualGross)} />
          <SlipLine label="Rent relief" value={`− ${naira(calc.rentRelief)}`} />
          <SlipLine label="Allowable deductions" value={`− ${naira(calc.allowableAnnual)}`} />
          <SlipLine label="Annual taxable income" value={naira(calc.taxableAnnual)} />
          <SlipLine label="Annual PAYE" value={naira(calc.annualTax)} />
          <SlipLine label="Monthly PAYE" value={naira(calc.paye)} />
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: "var(--muted)", marginTop: 16, lineHeight: 1.5 }}>
        This is a computer-generated payslip and does not require a signature.<br />
        Queries should be directed to the People team within 14 days of issue.
      </div>
    </div>
  );
}

function SimpleSlip({ emp, calc, month, company }) {
  const D = calc.deductions;
  return (
    <div>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{company.name}</div>
        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Payslip (NTA 2025 PAYE) · {monthLabel(month)}</div>
      </div>
      <div className="cp-form-grid" style={{ marginBottom: 18, gap: 8 }}>
        <div><PayRow label="Employee name" value={emp.name} mono={false} /><PayRow label="Employee ID" value={emp.id.slice(-6).toUpperCase()} /><PayRow label="Position" value={emp.title || "—"} mono={false} /><PayRow label="Department" value={emp.dept || "—"} mono={false} /></div>
        <div><PayRow label="BVN" value={emp.bvn || "—"} /><PayRow label="NIN" value={emp.nin || "—"} /><PayRow label="Bank" value={emp.bank || "—"} mono={false} /><PayRow label="Account" value={emp.acct || "—"} /></div>
      </div>
      <div className="cp-form-grid" style={{ gap: 18 }}>
        <div>
          <div className="cp-slip-head">Earnings</div>
          <PayRow label="Basic" value={naira(calc.earnings.basic)} />
          <PayRow label="Transportation Allow." value={naira(calc.earnings.transport)} />
          <PayRow label="Bonus / Commission" value={naira(calc.earnings.bonus)} />
          <PayRow label="Holiday Pay" value={naira(calc.earnings.holiday)} />
          <PayRow label="Sunday Pay" value={naira(calc.earnings.sunday)} />
          <PayRow label="Other Allowance" value={naira(calc.earnings.other)} />
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6 }}><PayRow label="Total earnings" value={naira(calc.gross)} bold /></div>
        </div>
        <div>
          <div className="cp-slip-head">Deductions</div>
          <PayRow label="PAYE (NTA 2025)" value={naira(D.paye)} />
          <PayRow label={`Employee Pension (${calc.pensionRate}%)`} value={naira(D.pension)} />
          <PayRow label="NHF" value={naira(D.nhf)} />
          <PayRow label="NHIS" value={naira(D.nhis)} />
          <PayRow label="Life Insurance" value={naira(D.lifeIns)} />
          <PayRow label="Mortgage Interest" value={naira(D.mortgage)} />
          <PayRow label="Loans Repayment" value={naira(D.loan)} />
          {calc.loanShortfall > 0 && <div style={{ fontSize: 11.5, color: "var(--warn)", marginTop: -2, marginBottom: 4 }}>{naira(calc.loanShortfall)} carried to next month — pay wouldn't cover it</div>}
          <PayRow label="Lateness Deduction" value={naira(D.lateness)} />
          <PayRow label="Absence Deduction" value={naira(D.absence)} />
          <PayRow label="Other Deductions" value={naira(D.otherDed)} />
          <div style={{ borderTop: "1px solid var(--line)", marginTop: 6, paddingTop: 6 }}><PayRow label="Total deductions" value={naira(calc.totalDeductions)} bold /></div>
        </div>
      </div>
      <div className="cp-form-grid" style={{ gap: 18, marginTop: 18 }}>
        <div>
          <div className="cp-slip-head">Attendance</div>
          <PayRow label="Working days" value={calc.workingDays} />
          <PayRow label="Days worked" value={calc.daysWorked} />
          <PayRow label="Daily rate" value={naira(calc.dailyRate)} />
        </div>
        <div>
          <div className="cp-slip-head">Leave / Sick</div>
          <PayRow label="Leave days (paid)" value={calc.leaveDays} />
          <PayRow label="Sick days (paid)" value={calc.sickDays} />
          <PayRow label="Unpaid leave days" value={calc.unpaidDays} />
        </div>
      </div>
      <div style={{ background: "var(--brand-soft)", borderRadius: 12, padding: "14px 18px", marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15 }}>NET PAY</span>
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 21, color: "var(--brand)" }}>{naira(calc.net)}</span>
      </div>
      <div style={{ marginTop: 18, background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 12, padding: 16 }}>
        <div className="cp-slip-head">NTA 2025 tax calculation</div>
        <PayRow label="Gross monthly" value={naira(calc.gross)} />
        <PayRow label="Gross annual" value={naira(calc.annualGross)} />
        <PayRow label="Rent relief (20%, cap ₦500k)" value={`− ${naira(calc.rentRelief)}`} />
        <PayRow label="Allowable deductions (annual)" value={`− ${naira(calc.allowableAnnual)}`} />
        <PayRow label="Taxable income (annual)" value={naira(calc.taxableAnnual)} bold />
        <PayRow label="Annual PAYE (bands)" value={naira(calc.annualTax)} />
        <PayRow label="Monthly PAYE" value={naira(calc.paye)} bold />
      </div>
    </div>
  );
}

function Payslip({ emp, calc, month, company, ytd, template, onClose }) {
  const [tpl, setTpl] = useState(template || "detailed");
  return (
    <div className="cp-modal-wrap" onClick={onClose}>
      <div className="cp-modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-head">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, margin: 0 }}>Payslip · {monthLabel(month)}</h3>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="cp-seg">
              <button className={tpl === "detailed" ? "on" : ""} onClick={() => setTpl("detailed")}>Detailed</button>
              <button className={tpl === "simple" ? "on" : ""} onClick={() => setTpl("simple")}>Simple</button>
            </div>
            <button className="cp-icon-btn" onClick={onClose}><X size={16} /></button>
          </div>
        </div>
        <div className="cp-modal-body">
          {tpl === "detailed"
            ? <DetailedSlip emp={emp} calc={calc} month={month} company={company} ytd={ytd} />
            : <SimpleSlip emp={emp} calc={calc} month={month} company={company} />}
        </div>
      </div>
    </div>
  );
}

function PayrollPage({ db, isHR, isManager, myEmp, empById, generatePayrun, updatePayrunLine, finalisePayrun, reopenPayrun, deletePayrun, requestLoan, decideLoan, writeOffLoan, toast }) {
  const [tab, setTab] = useState(isHR ? "runs" : "mine");
  const [month, setMonth] = useState(monthKey(new Date()));
  const [slip, setSlip] = useState(null);
  const [editing, setEditing] = useState(null);
  const [loanOpen, setLoanOpen] = useState(false);
  const [confirmReopen, setConfirmReopen] = useState(false);
  const [lf, setLf] = useState({ type: "Salary advance", amount: "", months: "3", reason: "" });

  const run = db.payruns.find((r) => r.month === month);
  const myLoans = myEmp ? db.loans.filter((l) => l.empId === myEmp.id) : [];
  const pendingLoans = db.loans.filter((l) => l.status === "pending");
  const activeLoans = db.loans.filter((l) => l.status === "active");
  const myPayslips = myEmp ? db.payruns.filter((r) => r.status === "finalised" && r.lines.some((l) => l.empId === myEmp.id)) : [];

  return (
    <div className="cp-fade">
      <PageHead title="Payroll" sub="NTA 2025 PAYE · Naira" />

      <div className="cp-tabs">
        {isHR && <button className={"cp-tab" + (tab === "runs" ? " active" : "")} onClick={() => setTab("runs")}>Pay runs</button>}
        {(isHR || isManager) && <button className={"cp-tab" + (tab === "loans" ? " active" : "")} onClick={() => setTab("loans")}>Advances &amp; loans{pendingLoans.length ? ` · ${pendingLoans.length}` : ""}</button>}
        <button className={"cp-tab" + (tab === "mine" ? " active" : "")} onClick={() => setTab("mine")}>My pay</button>
      </div>

      {/* ---------- PAY RUNS ---------- */}
      {tab === "runs" && isHR && (
        <>
          <Card style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ minWidth: 200 }}>
                <Field label="Pay month">
                  <select className="cp-input" value={month} onChange={(e) => setMonth(e.target.value)}>
                    {monthOptions(12).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                </Field>
              </div>
              {(!run || run.status === "draft") && (
                <Btn icon={RefreshCw} onClick={() => generatePayrun(month)}>{run ? "Rebuild draft" : "Build pay run"}</Btn>
              )}
              {run && run.status === "draft" && <Btn variant="ghost" icon={Check} onClick={() => finalisePayrun(run.id)}>Finalise</Btn>}
              {run && run.status === "draft" && <Btn variant="ghost" icon={Trash2} onClick={() => deletePayrun(run.id)}>Delete draft</Btn>}
              {run && run.status === "finalised" && <Btn variant="ghost" icon={RefreshCw} onClick={() => setConfirmReopen(true)}>Reopen this run</Btn>}
              {run && <Badge tone={run.status === "finalised" ? "ok" : "warn"}>{run.status === "finalised" ? "Finalised" : "Draft"}</Badge>}
            </div>
          </Card>

          {!run ? <Card><Empty text={`No pay run for ${monthLabel(month)} yet.`} action={<Btn icon={RefreshCw} onClick={() => generatePayrun(month)}>Build pay run</Btn>} /></Card> : (
            <>
              {db.payroll.payBasis === "daysWorked" && run.lines.some((l) => l.calc.absentDays > 0) && (
                <Card style={{ marginBottom: 18, borderColor: "var(--warn)" }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--warn-soft)", color: "var(--warn)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><AlertTriangle size={17} /></span>
                    <div style={{ fontSize: 13, lineHeight: 1.55 }}>
                      <b>{run.lines.filter((l) => l.calc.absentDays > 0).length} people are being docked for absence.</b>{" "}
                      You're pro-rating pay by days worked, so anyone who didn't clock in is treated as absent. Check these against your own records before finalising — missing clock-ins look identical to genuine absence.
                    </div>
                  </div>
                </Card>
              )}
              <div className="cp-tiles" style={{ marginBottom: 18 }}>
                <Stat icon={Users} label="Employees" value={run.lines.length} />
                <Stat icon={Banknote} label="Gross" value={naira(run.lines.reduce((s, l) => s + l.calc.gross, 0))} />
                <Stat icon={Receipt} label="PAYE" value={naira(run.lines.reduce((s, l) => s + l.calc.deductions.paye, 0))} tone="accent" />
                <Stat icon={Wallet} label="Net to pay" value={naira(run.lines.reduce((s, l) => s + l.calc.net, 0))} />
              </div>
              <Card pad={0}>
                <div className="cp-table-wrap">
                  <table className="cp-table">
                    <thead><tr><th>Employee</th><th>Gross</th><th>PAYE</th><th>Pension</th><th>Loan</th><th>Total ded.</th><th>Net pay</th><th></th></tr></thead>
                    <tbody>
                      {run.lines.map((ln) => {
                        const e = empById(ln.empId);
                        if (!e) return null;
                        return (
                          <tr key={ln.empId}>
                            <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={e.name} size={30} /><div><div style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</div><div style={{ fontSize: 11.5, color: "var(--muted)" }}>{ln.calc.absentDays > 0 ? <span style={{ color: "var(--warn)", fontWeight: 600 }}>{ln.calc.absentDays} days absent</span> : ln.calc.lateDays > 0 ? <span style={{ color: "var(--warn)" }}>{ln.calc.lateDays} late</span> : (e.title || "—")}</div></div></div></td>
                            <td className="cp-num">{naira(ln.calc.gross)}</td>
                            <td className="cp-num">{naira(ln.calc.deductions.paye)}</td>
                            <td className="cp-num">{naira(ln.calc.deductions.pension)}</td>
                            <td className="cp-num">{ln.calc.deductions.loan ? naira(ln.calc.deductions.loan) : "—"}</td>
                            <td className="cp-num">{naira(ln.calc.totalDeductions)}</td>
                            <td className="cp-num" style={{ fontWeight: 700 }}>{naira(ln.calc.net)}</td>
                            <td>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button className="cp-mini" onClick={() => setSlip({ emp: e, calc: ln.calc })}><Eye size={13} /></button>
                                {run.status === "draft" && <button className="cp-mini" onClick={() => setEditing({ ...ln.extras, empId: ln.empId, name: e.name })}><Pencil size={13} /></button>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {/* ---------- ADVANCES & LOANS ---------- */}
      {tab === "loans" && (isHR || isManager) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card>
            <Section title={`Awaiting approval${pendingLoans.length ? ` · ${pendingLoans.length}` : ""}`}>
              {pendingLoans.length === 0 ? <Empty text="No requests waiting." /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {pendingLoans.map((l) => {
                    const e = empById(l.empId);
                    return (
                      <div key={l.id} className="cp-leaverow">
                        <Avatar name={e?.name || "?"} size={36} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontWeight: 600, fontSize: 13.5 }}>{e?.name}</span>
                            <Badge tone="brand">{l.type}</Badge>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>{naira(l.amount)}</span>
                          </div>
                          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                            {naira(l.monthly)}/month over {l.months} months · {l.reason}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="cp-mini cp-mini-ok" onClick={() => decideLoan(l.id, true)}><Check size={14} /> Approve</button>
                          <button className="cp-mini cp-mini-no" onClick={() => decideLoan(l.id, false)}><X size={14} /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </Card>

          <Card>
            <Section title="Outstanding balances">
              {activeLoans.length === 0 ? <Empty text="Nobody currently owes anything." /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {activeLoans.map((l) => {
                    const e = empById(l.empId);
                    const pct = Math.round((l.repaid / l.amount) * 100);
                    return (
                      <div key={l.id} style={{ border: "1px solid var(--line)", borderRadius: 11, padding: 14, background: "var(--card2)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            <Avatar name={e?.name || "?"} size={32} />
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{e?.name}</div>
                              <div style={{ fontSize: 12, color: "var(--muted)" }}>{l.type} · {naira(l.monthly)}/month</div>
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700 }}>{naira(l.amount - l.repaid)}</div>
                            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>of {naira(l.amount)} left</div>
                          </div>
                        </div>
                        <div style={{ height: 6, borderRadius: 6, background: "var(--line)", marginTop: 12, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${pct}%`, background: "var(--brand)", borderRadius: 6 }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>{pct}% repaid</span>
                          {isHR && <button className="cp-mini" onClick={() => writeOffLoan(l.id)}>Mark settled</button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </Card>
        </div>
      )}

      {/* ---------- MY PAY ---------- */}
      {tab === "mine" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card>
            <Section title="Salary advance / loan" action={myEmp && <Btn size="sm" icon={Plus} onClick={() => setLoanOpen(true)}>Request</Btn>}>
              {myLoans.length === 0 ? <Empty text="You haven't requested an advance or loan." /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {myLoans.map((l) => (
                    <div key={l.id} className="cp-leaverow">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <Badge tone="brand">{l.type}</Badge>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 13.5, fontWeight: 600 }}>{naira(l.amount)}</span>
                          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{naira(l.monthly)}/month × {l.months}</span>
                        </div>
                        {l.status === "active" && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{naira(l.amount - l.repaid)} still to repay</div>}
                      </div>
                      <Badge tone={l.status === "active" ? "warn" : l.status === "settled" ? "ok" : l.status === "declined" ? "danger" : "muted"}>
                        {l.status === "pending" ? "Awaiting approval" : l.status === "active" ? "Repaying" : l.status === "settled" ? "Settled" : "Declined"}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </Card>

          <Card>
            <Section title="My payslips">
              {myPayslips.length === 0 ? <Empty text="No finalised payslips yet." /> : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {myPayslips.map((r) => {
                    const ln = r.lines.find((l) => l.empId === myEmp.id);
                    return (
                      <div key={r.id} className="cp-leaverow">
                        <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand-soft)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Receipt size={16} /></span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{monthLabel(r.month)}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>Net {naira(ln.calc.net)}</div>
                        </div>
                        <button className="cp-mini" onClick={() => setSlip({ emp: myEmp, calc: ln.calc, month: r.month })}><Eye size={13} /> View</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </Card>
        </div>
      )}

      {confirmReopen && run && (
        <Modal title="Reopen this pay run" onClose={() => setConfirmReopen(false)} submitLabel="Reopen it"
          onSubmit={() => { reopenPayrun(run.id); setConfirmReopen(false); }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            This turns <b>{monthLabel(run.month)}</b> back into a draft so you can correct it and finalise again.
          </p>
          <div style={{ background: "var(--warn-soft)", border: "1px solid var(--warn)", borderRadius: 10, padding: 14, marginTop: 14, fontSize: 13, lineHeight: 1.55 }}>
            Any loan or advance repayments taken in this run will be <b>put back</b> onto the outstanding balance,
            so nothing is counted twice when you finalise again.
          </div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, marginTop: 14, marginBottom: 0 }}>
            If you've already paid people for this month, correct your own records too — Renla doesn't move money.
          </p>
        </Modal>
      )}

      {slip && <Payslip emp={slip.emp} calc={slip.calc} month={slip.month || month} company={db.company} template={db.payroll.payslipTemplate} ytd={ytdFor(db, slip.emp.id, slip.month || month)} onClose={() => setSlip(null)} />}

      {editing && run && (
        <Modal title={`Adjust ${editing.name}`} onClose={() => setEditing(null)} submitLabel="Apply"
          onSubmit={() => {
            updatePayrunLine(run.id, editing.empId, {
              bonus: Number(editing.bonus) || 0, lateness: Number(editing.lateness) || 0,
              otherDed: Number(editing.otherDed) || 0, daysWorked: Number(editing.daysWorked) || 0,
              unpaidDays: Number(editing.unpaidDays) || 0, absence: undefined,
            });
            setEditing(null); toast("Line updated");
          }}>
          <div className="cp-form-grid">
            <Field label="Bonus / commission (₦)"><input className="cp-input" value={editing.bonus ?? ""} onChange={(e) => setEditing({ ...editing, bonus: e.target.value.replace(/[^0-9]/g, "") })} /></Field>
            <Field label="Days worked"><input className="cp-input" value={editing.daysWorked ?? ""} onChange={(e) => setEditing({ ...editing, daysWorked: e.target.value.replace(/[^0-9]/g, "") })} /></Field>
            <Field label="Unpaid leave days" hint="Deducted at the daily rate"><input className="cp-input" value={editing.unpaidDays ?? ""} onChange={(e) => setEditing({ ...editing, unpaidDays: e.target.value.replace(/[^0-9]/g, "") })} /></Field>
            <Field label="Lateness deduction (₦)"><input className="cp-input" value={editing.lateness ?? ""} onChange={(e) => setEditing({ ...editing, lateness: e.target.value.replace(/[^0-9]/g, "") })} /></Field>
            <Field label="Other deductions (₦)"><input className="cp-input" value={editing.otherDed ?? ""} onChange={(e) => setEditing({ ...editing, otherDed: e.target.value.replace(/[^0-9]/g, "") })} /></Field>
          </div>
        </Modal>
      )}

      {loanOpen && (
        <Modal title="Request an advance or loan" onClose={() => setLoanOpen(false)} submitLabel="Send request"
          onSubmit={() => { if (requestLoan(lf)) { setLoanOpen(false); setLf({ type: "Salary advance", amount: "", months: "3", reason: "" }); } }}>
          <div className="cp-form-grid">
            <Field label="Type">
              <select className="cp-input" value={lf.type} onChange={(e) => setLf({ ...lf, type: e.target.value })}>
                <option>Salary advance</option><option>Staff loan</option>
              </select>
            </Field>
            <Field label="Amount (₦)"><input className="cp-input" value={lf.amount} onChange={(e) => setLf({ ...lf, amount: e.target.value.replace(/[^0-9]/g, "") })} placeholder="150000" /></Field>
            <Field label="Repay over (months)">
              <select className="cp-input" value={lf.months} onChange={(e) => setLf({ ...lf, months: e.target.value })}>
                {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => <option key={m} value={m}>{m} {m === 1 ? "month" : "months"}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ marginTop: 14 }}><Field label="Reason"><textarea className="cp-input" rows={3} value={lf.reason} onChange={(e) => setLf({ ...lf, reason: e.target.value })} /></Field></div>
          {Number(lf.amount) > 0 && Number(lf.months) > 0 && (
            <div style={{ marginTop: 14, background: "var(--brand-soft)", borderRadius: 10, padding: "12px 14px", fontSize: 13.5 }}>
              <b style={{ fontFamily: "var(--font-mono)" }}>{naira(Math.ceil(Number(lf.amount) / Number(lf.months)))}</b> would be deducted from each month's pay for {lf.months} months.
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}


export { PayRow, SlipLine, DetailedSlip, SimpleSlip, Payslip, PayrollPage };
