import { useState } from "react";
import { Clock3, Plus, Check, X, Building2, MapPin, Download, PartyPopper, BadgeCheck, Trash2, Database, Info, Copy, Camera, Smartphone, Wifi, ShieldAlert, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { DEFAULT_PAYROLL } from "../features/payroll/payrollEngine.js";
import { durLabel, crossesMidnight, minutesBetween } from "../features/attendance/attendanceLogic.js";
import { uid, fmtShort, fmtLong, copyText } from "../lib/format.js";
import { getPosition, locErrLabel } from "../lib/geo.js";
import { DEFAULT_WORK } from "../lib/presence.js";
import { Avatar, Badge, Card, Btn, Field, Section, PageHead, Empty, Modal } from "../components/ui.jsx";
import { WeekScheduleEditor } from "../components/WeekScheduleEditor.jsx";
import { Payslip } from "./PayrollPage.jsx";

function SettingsPage({ db, update, toast, exportData, me, resetAll, addSite, deleteSite, approveDevice, revokeDevice, removeDevice, reload }) {
  const [name, setName] = useState(db.company.name);
  const [work, setWork] = useState({ ...DEFAULT_WORK, ...(db.work || {}) });
  const [site, setSite] = useState({ name: "", lat: "", lng: "", radius: "200" });
  const [pr, setPr] = useState({ ...DEFAULT_PAYROLL, ...(db.payroll || {}) });
  const [picking, setPicking] = useState(false);
  const [newCheckTime, setNewCheckTime] = useState("");
  const [branch, setBranch] = useState({ name: "", address: "" });
  const [editingBranchHours, setEditingBranchHours] = useState("");
  const [newDept, setNewDept] = useState("");
  const [hol, setHol] = useState({ name: "", date: "" });
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="cp-fade" style={{ maxWidth: 760 }}>
      <PageHead title="Settings" sub="Company, departments, holidays and accounts" />

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card>
          <Section title="Company">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 220 }}><Field label="Company name"><input className="cp-input" value={name} onChange={(e) => setName(e.target.value)} /></Field></div>
              <Btn onClick={() => { update((d) => ({ ...d, company: { ...d.company, name } })); toast("Company name saved"); }}>Save</Btn>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Working hours">
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.5 }}>
              Used to flag late clock-ins and to pre-fill new shifts on the rota — and, unless a branch or a person has their own hours instead, this is what everyone follows.
            </div>
            <div className="cp-tabs" style={{ marginBottom: 14 }}>
              <button type="button" className={"cp-tab" + (!work.weekSchedule ? " active" : "")} onClick={() => setWork({ ...work, weekSchedule: null })}>Same hours every day</button>
              <button type="button" className={"cp-tab" + (work.weekSchedule ? " active" : "")} onClick={() => setWork({ ...work, weekSchedule: work.weekSchedule || {} })}>Different hours per day</button>
            </div>
            {!work.weekSchedule ? (
              <div className="cp-form-grid">
                <Field label="Office opens" hint="Drives the late flag and lateness pay deduction"><input type="time" className="cp-input" value={work.dayStart} onChange={(e) => setWork({ ...work, dayStart: e.target.value })} /></Field>
                <Field label="Office closes" hint="Sets the length of a working day"><input type="time" className="cp-input" value={work.dayEnd} onChange={(e) => setWork({ ...work, dayEnd: e.target.value })} /></Field>
                <Field label="Grace period (minutes)" hint="How late someone can clock in before it's flagged">
                  <input className="cp-input" value={work.graceMins} onChange={(e) => setWork({ ...work, graceMins: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} />
                </Field>
              </div>
            ) : (
              <>
                <WeekScheduleEditor schedule={work.weekSchedule}
                  onChangeDay={(day, patch) => setWork({ ...work, weekSchedule: { ...work.weekSchedule, [day]: { ...(work.weekSchedule[day] || {}), ...patch } } })}
                  note="Leave a day's times blank and it uses Office opens/closes below for that day instead." />
                <div className="cp-form-grid" style={{ marginTop: 14 }}>
                  <Field label="Office opens (fallback)" hint="Used for any day left blank above"><input type="time" className="cp-input" value={work.dayStart} onChange={(e) => setWork({ ...work, dayStart: e.target.value })} /></Field>
                  <Field label="Office closes (fallback)" hint="Used for any day left blank above"><input type="time" className="cp-input" value={work.dayEnd} onChange={(e) => setWork({ ...work, dayEnd: e.target.value })} /></Field>
                  <Field label="Grace period (minutes)" hint="How late someone can clock in before it's flagged">
                    <input className="cp-input" value={work.graceMins} onChange={(e) => setWork({ ...work, graceMins: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} />
                  </Field>
                </div>
              </>
            )}
            <div style={{ marginTop: 14 }}>
              <Btn onClick={() => { update((d) => ({ ...d, work })); toast("Working hours saved"); }}>Save working hours</Btn>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Payroll (NTA 2025)">
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
              These drive every payslip. Statutory rates change — when the law moves, update them here rather than waiting for a new version of the app.
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "4px 0 10px" }}>Working days</div>
            <div className="cp-form-grid">
              <Field label="How working days are counted">
                <select className="cp-input" value={pr.workingDaysMode} onChange={(e) => setPr({ ...pr, workingDaysMode: e.target.value })}>
                  <option value="fixed">Fixed number I set</option>
                  <option value="calendar">Weekdays in the month, minus public holidays</option>
                </select>
              </Field>
              <Field label="Working days per month" hint={pr.workingDaysMode === "calendar" ? "Ignored — calculated from the calendar" : "Used for the daily rate"}>
                <input className="cp-input" disabled={pr.workingDaysMode === "calendar"} value={pr.workingDays} onChange={(e) => setPr({ ...pr, workingDays: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} />
              </Field>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "20px 0 10px" }}>Pay basis &amp; lateness</div>
            <div className="cp-form-grid">
              <Field label="How pay is calculated">
                <select className="cp-input" value={pr.payBasis} onChange={(e) => setPr({ ...pr, payBasis: e.target.value })}>
                  <option value="full">Full salary — only unpaid leave is deducted</option>
                  <option value="daysWorked">Pro-rate by days actually worked (from Attendance)</option>
                </select>
              </Field>
              <Field label="Lateness">
                <select className="cp-input" value={pr.latenessMode} onChange={(e) => setPr({ ...pr, latenessMode: e.target.value })}>
                  <option value="none">Don't deduct for lateness</option>
                  <option value="prorata">Deduct per minute late (at the daily rate)</option>
                  <option value="fixed">Flat fee for each late day</option>
                </select>
              </Field>
              <Field label="Personal time out of the office">
                <select className="cp-input" value={pr.personalTimeDeduct ? "yes" : "no"} onChange={(e) => setPr({ ...pr, personalTimeDeduct: e.target.value === "yes" })}>
                  <option value="no">Don't deduct approved personal time</option>
                  <option value="yes">Deduct approved personal time from pay</option>
                </select>
              </Field>
              {pr.latenessMode === "fixed" && (
                <Field label="Fee per late day (₦)"><input className="cp-input" value={pr.latenessFee} onChange={(e) => setPr({ ...pr, latenessFee: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} /></Field>
              )}
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
              <Clock3 size={13} style={{ marginTop: 1, flex: "0 0 auto" }} />
              <span>Lateness is measured against your opening time ({work.dayStart}) plus the {work.graceMins}-minute grace period — both set in Clock-in checks below.</span>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "20px 0 10px" }}>Employer contributions</div>
            <div className="cp-form-grid">
              <Field label="Employer pension (%)"><input className="cp-input" value={pr.employerPension} onChange={(e) => setPr({ ...pr, employerPension: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></Field>
              <Field label="NSITF (%)"><input className="cp-input" value={pr.nsitfRate} onChange={(e) => setPr({ ...pr, nsitfRate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></Field>
              <Field label="ITF (%)" hint="Usually only for 5+ staff"><input className="cp-input" value={pr.itfRate} onChange={(e) => setPr({ ...pr, itfRate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></Field>
              <Field label="Payslip layout">
                <select className="cp-input" value={pr.payslipTemplate} onChange={(e) => setPr({ ...pr, payslipTemplate: e.target.value })}>
                  <option value="detailed">Detailed — Nigerian standard (YTD, employer costs, amount in words)</option>
                  <option value="simple">Simple — your Renla template</option>
                </select>
              </Field>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "20px 0 10px" }}>Statutory rates</div>
            <div className="cp-form-grid">
              <Field label="Employee pension (%)"><input className="cp-input" value={pr.pensionRate} onChange={(e) => setPr({ ...pr, pensionRate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></Field>
              <Field label="NHF (% of basic)"><input className="cp-input" value={pr.nhfRate} onChange={(e) => setPr({ ...pr, nhfRate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></Field>
              <Field label="Rent relief (%)"><input className="cp-input" value={pr.rentReliefRate} onChange={(e) => setPr({ ...pr, rentReliefRate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></Field>
              <Field label="Rent relief cap (₦)"><input className="cp-input" value={pr.rentReliefCap} onChange={(e) => setPr({ ...pr, rentReliefCap: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} /></Field>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "20px 0 10px" }}>Annual PAYE bands</div>
            <div className="cp-table-wrap">
              <table className="cp-table">
                <thead><tr><th>Band</th><th>From (₦)</th><th>To (₦)</th><th>Rate (%)</th></tr></thead>
                <tbody>
                  {(pr.bands || []).map((b, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{i + 1}</td>
                      <td><input className="cp-input" style={{ minWidth: 110 }} value={b.from} onChange={(e) => setPr({ ...pr, bands: (pr.bands || []).map((x, j) => (j === i ? { ...x, from: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 } : x)) })} /></td>
                      <td><input className="cp-input" style={{ minWidth: 110 }} placeholder="no limit" value={b.to ?? ""} onChange={(e) => setPr({ ...pr, bands: (pr.bands || []).map((x, j) => (j === i ? { ...x, to: e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9]/g, "")) || 0 } : x)) })} /></td>
                      <td><input className="cp-input" style={{ minWidth: 70 }} value={Math.round(b.rate * 100)} onChange={(e) => setPr({ ...pr, bands: (pr.bands || []).map((x, j) => (j === i ? { ...x, rate: (Number(e.target.value.replace(/[^0-9]/g, "")) || 0) / 100 } : x)) })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <Btn onClick={() => { update((d) => ({ ...d, payroll: pr })); toast("Payroll settings saved"); }}>Save payroll settings</Btn>
              <Btn variant="ghost" icon={RefreshCw} onClick={() => { setPr({ ...DEFAULT_PAYROLL }); toast("Reset to NTA 2025 defaults — remember to save", "warn"); }}>Reset to NTA 2025</Btn>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
              <Info size={13} style={{ marginTop: 1, flex: "0 0 auto" }} />
              <span>Renla works out the figures; it doesn't file or remit them. PAYE goes to your state internal revenue service and pension to your PFA on their own deadlines — check the numbers against your accountant before the first live run.</span>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Clock-in checks">
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
              Each check runs only at the moment someone clocks in. Anything that fails doesn't block them — it flags the record for review, so genuine problems get sorted instead of people being locked out.
            </div>
            {[
              { k: "requireLocation", icon: MapPin, t: "Location (GPS)", d: "Records which work location they clocked in from." },
              { k: "requireDevice", icon: Smartphone, t: "Registered device", d: "Only the phone or computer you've approved for that person counts." },
              { k: "requireSelfie", icon: Camera, t: "Selfie", d: "Takes a small photo at clock-in, shown as a thumbnail in the log." },
              { k: "recordIP", icon: Wifi, t: "IP address", d: "Records the network — useful for spotting shared connections or VPNs." },
            ].map(({ k, icon: Icon, t, d }) => (
              <label key={k} style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12, fontSize: 13.5, cursor: "pointer" }}>
                <input type="checkbox" style={{ marginTop: 3 }} checked={!!work[k]} onChange={(e) => setWork({ ...work, [k]: e.target.checked })} />
                <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <Icon size={15} style={{ marginTop: 1, color: "var(--brand)", flex: "0 0 auto" }} />
                  <span>{t}<br /><span style={{ fontSize: 12, color: "var(--muted)" }}>{d}</span></span>
                </span>
              </label>
            ))}
            <div style={{ borderTop: "1px solid var(--line)", margin: "18px 0 14px", paddingTop: 16 }}>
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}>
                <input type="checkbox" style={{ marginTop: 3 }} checked={!!work.presenceChecks}
                  onChange={(e) => setWork({ ...work, presenceChecks: e.target.checked })} />
                <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <BadgeCheck size={15} style={{ marginTop: 1, color: "var(--brand)", flex: "0 0 auto" }} />
                  <span>Mid-shift presence checks<br /><span style={{ fontSize: 12, color: "var(--muted)" }}>
                    At the times you set, staff are asked to confirm they're still at work — a photo and their location.
                  </span></span>
                </span>
              </label>

              {work.presenceChecks && (
                <div style={{ marginTop: 14, paddingLeft: 28 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>
                    Check times ({(work.checkTimes || []).length})
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    {(work.checkTimes || []).map((t, i) => (
                      <span key={i} className="cp-chip">
                        {t}
                        <button onClick={() => setWork({ ...work, checkTimes: work.checkTimes.filter((_, j) => j !== i) })}><X size={12} /></button>
                      </span>
                    ))}
                    {(work.checkTimes || []).length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>None set — no checks will run.</span>}
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 140 }}>
                      <Field label="Add a time">
                        <input type="time" className="cp-input" value={newCheckTime} onChange={(e) => setNewCheckTime(e.target.value)} />
                      </Field>
                    </div>
                    <Btn size="sm" icon={Plus} onClick={() => {
                      if (!newCheckTime) { toast("Pick a time", "warn"); return; }
                      if ((work.checkTimes || []).includes(newCheckTime)) { toast("That time is already set", "warn"); return; }
                      setWork({ ...work, checkTimes: [...(work.checkTimes || []), newCheckTime].sort() });
                      setNewCheckTime("");
                    }}>Add</Btn>
                    <div style={{ minWidth: 170 }}>
                      <Field label="Minutes to respond" hint="After this, it counts as missed">
                        <input className="cp-input" value={work.checkWindowMins ?? 30}
                          onChange={(e) => setWork({ ...work, checkWindowMins: Number(e.target.value.replace(/[^0-9]/g, "")) || 0 })} />
                      </Field>
                    </div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
                    <Info size={13} style={{ marginTop: 1, flex: "0 0 auto" }} />
                    <span>A check only appears once its time has passed, and only for people who've clocked in and haven't clocked out. Missed checks go to your review queue — they never deduct pay automatically.</span>
                  </div>
                </div>
              )}
            </div>

            <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 16, fontSize: 13.5, cursor: work.requireLocation ? "pointer" : "not-allowed", opacity: work.requireLocation ? 1 : 0.5 }}>
              <input type="checkbox" style={{ marginTop: 3 }} disabled={!work.requireLocation} checked={work.blockOffsite} onChange={(e) => setWork({ ...work, blockOffsite: e.target.checked })} />
              <span style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <ShieldAlert size={15} style={{ marginTop: 1, color: "var(--warn)", flex: "0 0 auto" }} />
                <span>Hard-block clock-in outside a work location<br /><span style={{ fontSize: 12, color: "var(--muted)" }}>Strict. Poor signal or a denied permission means they can't clock in at all.</span></span>
              </span>
            </label>
            <Btn onClick={() => { update((d) => ({ ...d, work })); toast("Clock-in checks saved"); }}>Save checks</Btn>
            <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
              <Info size={13} style={{ marginTop: 1, flex: "0 0 auto" }} />
              <span>Photos are stored small and cleared automatically after 90 days. Tell your team what's recorded before switching these on — it's both the decent thing and what Nigeria's data-protection rules expect.</span>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Registered devices">
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
              Each person gets one approved device. When someone changes phone they request the new one here — approving it revokes the old one automatically.
            </div>
            {db.devices.length === 0 ? <Empty text="No devices registered yet." /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[...db.devices].sort((a, b) => (a.status === "pending" ? -1 : 1)).map((dv) => {
                  const emp = db.employees.find((e) => e.id === dv.empId);
                  return (
                    <div key={dv.id} className="cp-leaverow">
                      <Smartphone size={16} style={{ color: dv.status === "active" ? "var(--brand)" : "var(--muted)" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{emp?.name || "Unknown"}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{dv.label} · requested {fmtShort(dv.requested)}</div>
                      </div>
                      <Badge tone={dv.status === "active" ? "ok" : dv.status === "pending" ? "warn" : "muted"}>{dv.status}</Badge>
                      <div style={{ display: "flex", gap: 6 }}>
                        {dv.status === "pending" && <button className="cp-mini cp-mini-ok" onClick={() => approveDevice(dv.id)}><Check size={13} /> Approve</button>}
                        {dv.status === "active" && <button className="cp-mini" onClick={() => revokeDevice(dv.id)}>Revoke</button>}
                        <button className="cp-mini cp-mini-no" onClick={() => removeDevice(dv.id)}><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </Card>

        <Card>
          <Section title="Work locations">
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
              Set the places staff are expected to clock in from. When location checking is on, Renla records where someone was at the moment they clock in and out — and nothing in between.
            </div>

            {db.sites.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                {db.sites.map((s) => (
                  <div key={s.id} className="cp-leaverow">
                    <MapPin size={16} style={{ color: "var(--brand)" }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{s.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{Number(s.lat).toFixed(5)}, {Number(s.lng).toFixed(5)} · {s.radius} m radius</div>
                    </div>
                    <button className="cp-mini cp-mini-no" onClick={() => deleteSite(s.id)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>Add a location</div>
            <div className="cp-form-grid">
              <Field label="Name"><input className="cp-input" value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} placeholder="e.g. Lekki Workshop" /></Field>
              <Field label="Radius (metres)" hint="How far from the point still counts as on site"><input className="cp-input" value={site.radius} onChange={(e) => setSite({ ...site, radius: e.target.value.replace(/[^0-9]/g, "") })} /></Field>
              <Field label="Latitude"><input className="cp-input" value={site.lat} onChange={(e) => setSite({ ...site, lat: e.target.value })} placeholder="6.43520" /></Field>
              <Field label="Longitude"><input className="cp-input" value={site.lng} onChange={(e) => setSite({ ...site, lng: e.target.value })} placeholder="3.45120" /></Field>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <Btn variant="ghost" icon={MapPin} disabled={picking} onClick={async () => {
                setPicking(true);
                const p = await getPosition();
                setPicking(false);
                if (p.error) { toast(locErrLabel(p.error), "danger"); return; }
                setSite((s) => ({ ...s, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) }));
                toast(`Coordinates captured (±${p.acc} m)`);
              }}>{picking ? "Finding you…" : "Use my current location"}</Btn>
              <Btn icon={Plus} onClick={() => { if (addSite(site)) setSite({ name: "", lat: "", lng: "", radius: "200" }); }}>Add location</Btn>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: "var(--muted)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
              <Info size={13} style={{ marginTop: 1, flex: "0 0 auto" }} />
              <span>Stand at the site and tap "Use my current location", or find the coordinates on Google Maps (right-click the spot → the numbers at the top). Tell your team before you switch this on — location is personal data, and being upfront about what's recorded is both the decent and the compliant thing to do.</span>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Branches">
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
              Lagos, Abuja, Port Harcourt — wherever you operate. Assign each employee to a branch and you can compare attendance and costs site by site.
            </div>
            {(db.branches || []).length === 0 ? <Empty text="No branches yet — everyone sits under one company." /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {db.branches.map((b) => {
                  const n = db.employees.filter((e) => e.branchId === b.id).length;
                  const editing = editingBranchHours === b.id;
                  return (
                    <div key={b.id} style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                      <div className="cp-leaverow" style={{ border: "none", borderRadius: 0 }}>
                        <Building2 size={16} style={{ color: "var(--brand)" }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>{b.name}</div>
                          <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            {n} {n === 1 ? "person" : "people"}{b.address ? ` · ${b.address}` : ""}
                            {" · "}{b.useCompanySchedule === false ? "own hours" : "company hours"}
                          </div>
                        </div>
                        <button className="cp-mini" onClick={() => setEditingBranchHours(editing ? "" : b.id)}><Clock3 size={13} /></button>
                        <button className="cp-mini cp-mini-no" onClick={() => {
                          update((d) => ({ ...d, branches: d.branches.filter((x) => x.id !== b.id),
                            employees: d.employees.map((e) => (e.branchId === b.id ? { ...e, branchId: "" } : e)) }));
                          toast("Branch removed", "danger");
                        }}><Trash2 size={13} /></button>
                      </div>
                      {editing && (
                        <BranchHoursEditor branch={b} onClose={() => setEditingBranchHours("")}
                          onSave={(patch) => { update((d) => ({ ...d, branches: d.branches.map((x) => (x.id === b.id ? { ...x, ...patch } : x)) })); toast("Branch hours saved"); setEditingBranchHours(""); }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="cp-form-grid">
              <Field label="Branch name"><input className="cp-input" value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} placeholder="e.g. Lagos" /></Field>
              <Field label="Address (optional)"><input className="cp-input" value={branch.address} onChange={(e) => setBranch({ ...branch, address: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Btn icon={Plus} onClick={() => {
                const v = branch.name.trim();
                if (!v) { toast("Give the branch a name", "warn"); return; }
                if ((db.branches || []).some((b) => b.name === v)) { toast("That branch already exists", "warn"); return; }
                update((d) => ({ ...d, branches: [...(d.branches || []), { id: uid("br"), name: v, address: branch.address }] }));
                setBranch({ name: "", address: "" }); toast("Branch added");
              }}>Add branch</Btn>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Shift patterns">
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
              For teams that don't all work 9 to 5 — hotels, factories, security, hospitals. A shift may run past midnight; hours and lateness are worked out correctly either way.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
              {(work.shifts || []).map((sh, i) => (
                <div key={sh.id} className="cp-leaverow">
                  <Clock3 size={16} style={{ color: crossesMidnight(sh.start, sh.end) ? "var(--accent)" : "var(--brand)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <input className="cp-input" style={{ maxWidth: 180 }} value={sh.name}
                      onChange={(e) => setWork({ ...work, shifts: work.shifts.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                  </div>
                  <input type="time" className="cp-input" style={{ width: 120 }} value={sh.start}
                    onChange={(e) => setWork({ ...work, shifts: work.shifts.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)) })} />
                  <input type="time" className="cp-input" style={{ width: 120 }} value={sh.end}
                    onChange={(e) => setWork({ ...work, shifts: work.shifts.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)) })} />
                  <Badge tone={crossesMidnight(sh.start, sh.end) ? "accent" : "muted"}>
                    {durLabel(minutesBetween(sh.start, sh.end) || 0)}{crossesMidnight(sh.start, sh.end) ? " · overnight" : ""}
                  </Badge>
                  <button className="cp-mini cp-mini-no" onClick={() => setWork({ ...work, shifts: work.shifts.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
                </div>
              ))}
              {(work.shifts || []).length === 0 && <Empty text="No shift patterns — everyone follows the company working day." />}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn variant="ghost" icon={Plus} onClick={() => setWork({ ...work, shifts: [...(work.shifts || []),
                { id: uid("sh"), name: "New shift", start: "08:00", end: "16:00" }] })}>Add a shift</Btn>
              <Btn onClick={() => { update((d) => ({ ...d, work })); toast("Shift patterns saved"); }}>Save shifts</Btn>
            </div>
            <div style={{ marginTop: 14, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ minWidth: 220 }}>
                <Field label="Overtime">
                  <select className="cp-input" value={pr.payOvertime ? "yes" : "no"} onChange={(e) => setPr({ ...pr, payOvertime: e.target.value === "yes" })}>
                    <option value="no">Record overtime but don't pay it</option>
                    <option value="yes">Pay for time past the shift end</option>
                  </select>
                </Field>
              </div>
              <div style={{ minWidth: 130 }}>
                <Field label="Overtime multiplier"><input className="cp-input" value={pr.overtimeRate ?? 1.5}
                  onChange={(e) => setPr({ ...pr, overtimeRate: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })} /></Field>
              </div>
              <Btn variant="ghost" onClick={() => { update((d) => ({ ...d, payroll: pr })); toast("Overtime settings saved"); }}>Save overtime</Btn>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Departments">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {db.departments.map((d) => (
                <span key={d} className="cp-chip">
                  {d}
                  <button onClick={() => { update((x) => ({ ...x, departments: x.departments.filter((y) => y !== d) })); toast("Department removed", "danger"); }}><X size={12} /></button>
                </span>
              ))}
              {db.departments.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>None yet.</span>}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input className="cp-input" style={{ maxWidth: 240 }} value={newDept} onChange={(e) => setNewDept(e.target.value)} placeholder="Add a department" />
              <Btn icon={Plus} onClick={() => {
                const v = newDept.trim(); if (!v) return;
                if (db.departments.includes(v)) { toast("That department already exists", "warn"); return; }
                update((d) => ({ ...d, departments: [...d.departments, v] })); setNewDept(""); toast("Department added");
              }}>Add</Btn>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Public holidays">
            {db.holidays.length === 0 ? <Empty text="None added yet." /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                {[...db.holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => (
                  <div key={h.id} className="cp-leaverow">
                    <PartyPopper size={16} style={{ color: "var(--accent)" }} />
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>{h.name}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{fmtLong(h.date)}</div></div>
                    <button className="cp-mini cp-mini-no" onClick={() => { update((d) => ({ ...d, holidays: d.holidays.filter((x) => x.id !== h.id) })); toast("Holiday removed", "danger"); }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="cp-form-grid">
              <Field label="Holiday name"><input className="cp-input" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} placeholder="e.g. Eid-el-Kabir" /></Field>
              <Field label="Date"><input type="date" className="cp-input" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} /></Field>
            </div>
            <div style={{ marginTop: 12 }}>
              <Btn icon={Plus} onClick={() => {
                if (!hol.name.trim() || !hol.date) { toast("Add a name and a date", "warn"); return; }
                update((d) => ({ ...d, holidays: [...d.holidays, { id: uid("hd"), name: hol.name, date: hol.date }] }));
                setHol({ name: "", date: "" }); toast("Holiday added");
              }}>Add holiday</Btn>
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Staff logins">
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 14, lineHeight: 1.55 }}>
              Staff create their own password — you never see it. Send someone their staff code, they sign up with their email, paste the code, and they're in.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 18 }}>
              {db.employees.map((e) => {
                const linked = db.users.find((u) => u.employeeId === e.id);
                return (
                  <div key={e.id} className="cp-leaverow">
                    <Avatar name={e.name} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{e.title || "—"}</div>
                    </div>
                    {linked
                      ? <>
                          <Badge tone={linked.role === "HR Admin" ? "brand" : linked.role === "Manager" ? "accent" : "ok"}>{linked.role}</Badge>
                          {linked.id !== me.id && (
                            <select className="cp-input" style={{ width: 130 }} value={linked.role}
                              onChange={async (ev) => {
                                const { error } = await supabase.from("profiles").update({ role: ev.target.value }).eq("id", linked.id);
                                if (error) toast(error.message, "danger");
                                else { toast("Role updated"); reload(); }
                              }}>
                              {["Employee", "Manager", "HR Admin"].map((r) => <option key={r}>{r}</option>)}
                            </select>
                          )}
                        </>
                      : <button className="cp-mini" onClick={async () => {
                          const ok = await copyText(e.id);
                          if (ok) toast("Staff code copied — send it to " + e.name.split(" ")[0]);
                          else toast("Couldn't copy automatically — here's " + e.name.split(" ")[0] + "'s code: " + e.id, "danger", 9000);
                        }}><Copy size={13} /> Copy staff code</button>}
                  </div>
                );
              })}
            </div>
            <div style={{ background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.6 }}>
              <b style={{ color: "var(--ink)" }}>What to tell your team:</b> go to this website, choose <i>Create an account</i>, use your work email and a password of your own, then paste the staff code when asked.
            </div>
          </Section>
        </Card>

        <Card>
          <Section title="Your data">
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <Database size={16} style={{ color: "var(--muted)", marginTop: 1, flex: "0 0 auto" }} />
              <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55 }}>
                Everything you enter is saved to this browser and will still be here when you come back. It isn't on a server, so it won't sync to other devices or to your colleagues — download a backup regularly, and treat this as your own working copy rather than a hosted system.
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Btn variant="ghost" icon={Download} onClick={exportData}>Download backup</Btn>
              <Btn variant="ghost" icon={Trash2} onClick={() => setConfirmReset(true)}>Reset everything</Btn>
            </div>
          </Section>
        </Card>
      </div>

      {confirmReset && (
        <Modal title="Reset everything" onClose={() => setConfirmReset(false)} submitLabel="Delete everything"
          onSubmit={async () => { setConfirmReset(false); await resetAll(); }}>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>This deletes every employee, leave request, update and account, and starts the setup again. Download a backup first if there's anything you want to keep.</p>
        </Modal>
      )}
    </div>
  );
}

/* Inline editor for one branch's hours — either "follow the company" (the
   default) or its own Mon–Sun schedule, e.g. a branch that opens later than
   head office. Anyone on "Branch hours" in their own profile picks this up. */
function BranchHoursEditor({ branch, onSave, onClose }) {
  const [useOwn, setUseOwn] = useState(branch.useCompanySchedule === false);
  const [schedule, setSchedule] = useState(branch.weekSchedule || {});
  return (
    <div style={{ padding: 14, borderTop: "1px solid var(--line)", background: "var(--card2)" }}>
      <div className="cp-tabs" style={{ marginBottom: 14 }}>
        <button type="button" className={"cp-tab" + (!useOwn ? " active" : "")} onClick={() => setUseOwn(false)}>Use company hours</button>
        <button type="button" className={"cp-tab" + (useOwn ? " active" : "")} onClick={() => setUseOwn(true)}>Set hours for this branch</button>
      </div>
      {useOwn && (
        <WeekScheduleEditor schedule={schedule}
          onChangeDay={(day, patch) => setSchedule((s) => ({ ...s, [day]: { ...(s[day] || {}), ...patch } }))}
          note="Leave a day's times blank and this branch falls back to the company's hours for that day only." />
      )}
      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => onSave({ useCompanySchedule: !useOwn, weekSchedule: useOwn ? schedule : null })}>Save hours</Btn>
      </div>
    </div>
  );
}

export { SettingsPage };
