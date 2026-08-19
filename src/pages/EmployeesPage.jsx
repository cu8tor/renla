import { useState } from "react";
import { Users, Wallet, Search, Plus, UserPlus, Copy, X, ChevronRight, Briefcase, Building2, Phone, Mail, MapPin, ShieldCheck, Users2, Lock, Unlock, Landmark, CreditCard, Trash2, Pencil, ShieldAlert } from "lucide-react";
import { emptyPay } from "../features/payroll/payrollEngine.js";
import { CHECK_KEYS, hasOverrides } from "../features/attendance/attendanceLogic.js";
import { naira, grossOf, fmtShort, copyText } from "../lib/format.js";
import { emptyEmployee } from "../lib/payrollHelpers.js";
import { onboardingChecklist } from "../lib/onboarding.js";
import { Avatar, EmpAvatar, Badge, Card, Btn, Field, KV, PageHead, Empty, Modal } from "../components/ui.jsx";
import { WeekScheduleEditor } from "../components/WeekScheduleEditor.jsx";

function EmployeesPage({ db, isHR, isManager, myTeam, myEmp, saveEmployee, deleteEmployee, setEmployeeLock, empById, toast }) {
  const [editing, setEditing] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [q, setQ] = useState("");
  const [confirmDel, setConfirmDel] = useState(null);

  const list = isHR ? db.employees : isManager ? myTeam : db.employees;
  const shown = q.trim() ? list.filter((e) => (e.name + e.title + e.dept).toLowerCase().includes(q.toLowerCase())) : list;

  return (
    <div className="cp-fade">
      <PageHead title={isHR ? "Employees" : isManager ? "My team" : "Directory"} sub={`${list.length} ${list.length === 1 ? "person" : "people"}`}
        action={isHR && (
          <div style={{ display: "flex", gap: 8 }}>
            <Btn variant="ghost" icon={Plus} onClick={() => { setEditing(emptyEmployee()); setIsNew(true); }}>Full form</Btn>
            <Btn icon={UserPlus} onClick={() => setInviting(true)}>Invite employee</Btn>
          </div>
        )} />

      <div style={{ marginBottom: 14, maxWidth: 320 }}>
        <div className="cp-search" style={{ maxWidth: "none" }}>
          <Search size={15} style={{ color: "var(--muted)" }} />
          <input placeholder="Filter this list…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <Card pad={0}>
        {shown.length === 0 ? <div style={{ padding: 30 }}><Empty text={list.length === 0 ? "No employees yet." : "Nothing matches that filter."} action={isHR && list.length === 0 && <Btn icon={UserPlus} onClick={() => setInviting(true)}>Invite your first employee</Btn>} /></div> : (
          <div className="cp-table-wrap">
            <table className="cp-table">
              <thead><tr><th>Name</th><th>Department</th><th>Role</th>{isHR && <th>Salary / mo</th>}<th>Status</th>{isHR && <th>Onboarding</th>}<th></th></tr></thead>
              <tbody>
                {shown.map((e) => {
                  const docs = isHR ? (db.employeeDocs || []).filter((d) => d.empId === e.id) : null;
                  const checklist = isHR ? onboardingChecklist(e, db.onboarding, docs) : null;
                  return (
                  <tr key={e.id} className="cp-row" onClick={() => setViewing(e)}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <EmpAvatar emp={e} size={34} />
                        <div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{e.email || "—"}</div></div>
                      </div>
                    </td>
                    <td><Badge tone="muted">{e.dept || "—"}</Badge></td>
                    <td style={{ fontSize: 13 }}>{e.title || "—"}</td>
                    {isHR && <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{naira(grossOf(e))}</td>}
                    <td>
                      <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
                        <Badge tone={e.status === "Active" ? "ok" : "accent"}>{e.status}</Badge>
                        {isHR && hasOverrides(e) && <span title="Different clock-in checks from the company setting" style={{ color: "var(--accent)", display: "flex" }}><ShieldAlert size={13} /></span>}
                        {e.profileLocked && <span title="Profile locked — they can't edit their own details" style={{ color: "var(--muted)", display: "flex" }}><Lock size={13} /></span>}
                      </div>
                    </td>
                    {isHR && (
                      <td>
                        {checklist.requiredTotal === 0
                          ? <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>
                          : <Badge tone={checklist.complete ? "ok" : "warn"}>{checklist.requiredDone}/{checklist.requiredTotal}</Badge>}
                      </td>
                    )}
                    <td onClick={(ev) => ev.stopPropagation()}>
                      {isHR ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="cp-mini" title={e.profileLocked ? "Unlock — let them edit their own details again" : "Lock — freeze their own details so only HR can change them"}
                            onClick={() => setEmployeeLock(e.id, !e.profileLocked)}>
                            {e.profileLocked ? <Unlock size={13} /> : <Lock size={13} />}
                          </button>
                          <button className="cp-mini" onClick={() => { setEditing({ ...e }); setIsNew(false); }}><Pencil size={13} /></button>
                          <button className="cp-mini cp-mini-no" onClick={() => setConfirmDel(e)}><Trash2 size={13} /></button>
                        </div>
                      ) : <ChevronRight size={15} style={{ color: "var(--muted)" }} />}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {viewing && <ProfileDrawer emp={viewing} manager={empById(viewing.managerId)} isHR={isHR} isManager={isManager} isSelf={myEmp?.id === viewing.id} onClose={() => setViewing(null)} />}

      {editing && (
        <EmployeeForm
          emp={editing} isNew={isNew} db={db}
          onCancel={() => setEditing(null)}
          onSave={(e) => {
            if (!e.name.trim()) { toast("A name is required", "warn"); return; }
            saveEmployee(e, isNew); setEditing(null);
          }}
        />
      )}

      {inviting && (
        <InviteEmployeeModal db={db} toast={toast}
          onSave={(e) => saveEmployee(e, true)}
          onClose={() => setInviting(false)}
        />
      )}

      {confirmDel && (
        <DeleteEmployeeModal emp={confirmDel} onClose={() => setConfirmDel(null)}
          onConfirm={() => { deleteEmployee(confirmDel.id); setConfirmDel(null); }} />
      )}
    </div>
  );
}

// Typing the word out is deliberately friction — deleting an employee wipes
// their leave history and login, with no undo, so a stray click on the
// wrong row shouldn't be enough to do it. Its own component (rather than
// inline state in EmployeesPage) so the typed text always starts blank:
// this only ever exists while confirmDel is set, so opening it for a
// different employee is a fresh mount, not a state carried over from
// whoever was being deleted a moment ago.
function DeleteEmployeeModal({ emp, onClose, onConfirm }) {
  const [typed, setTyped] = useState("");
  const ready = typed.trim() === "DELETE";
  return (
    <Modal title="Remove employee" onClose={onClose} submitLabel="Remove permanently" danger
      submitDisabled={!ready} onSubmit={() => { if (ready) onConfirm(); }}>
      <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 16px" }}>
        Remove <b>{emp.name}</b> from your records? Their leave history and login will go too. This can't be undone — export a backup first if you might want it back.
      </p>
      <Field label={<>Type <b>DELETE</b> to confirm</>}>
        <input className="cp-input" autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
          placeholder="DELETE" onKeyDown={(e) => { if (e.key === "Enter" && ready) onConfirm(); }} />
      </Field>
    </Modal>
  );
}

function InviteEmployeeModal({ db, toast, onSave, onClose }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", title: "", dept: "", managerId: "" });
  const [created, setCreated] = useState(null);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  if (created) {
    return (
      <Modal title="Employee added" onClose={onClose} onSubmit={onClose} submitLabel="Done">
        <div style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          <b>{created.name}</b> is in. Send them this staff code — they'll sign up with their own email and password and paste it in to link their account.
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, padding: "12px 14px" }}>
          <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, flex: 1, wordBreak: "break-all" }}>{created.id}</code>
          <button className="cp-mini" onClick={async () => {
            const ok = await copyText(created.id);
            if (ok) toast("Staff code copied — send it to " + created.name.split(" ")[0]);
            else toast("Couldn't copy automatically — here's the code: " + created.id, "danger", 9000);
          }}><Copy size={13} /> Copy</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 14, lineHeight: 1.55 }}>
          Once they're in, they fill in the rest themselves — emergency contact, bank details, documents, a photo — from their own profile page. You can pick what's required under <b>Settings → Employee onboarding</b>, and invite another person any time from here.
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Invite employee" onClose={onClose} submitLabel="Create & get staff code"
      onSubmit={() => {
        if (!f.name.trim()) { toast("A name is required", "warn"); return; }
        const emp = { ...emptyEmployee(), ...f };
        onSave(emp);
        setCreated({ id: emp.id, name: emp.name });
      }}>
      <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.55 }}>
        Just the basics — your new hire fills in the rest themselves once they sign in with the staff code you'll get next.
      </div>
      <div className="cp-form-grid">
        <Field label="Full name"><input className="cp-input" autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Bola Ade" /></Field>
        <Field label="Email" hint="Optional"><input className="cp-input" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone" hint="Optional"><input className="cp-input" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+234 …" /></Field>
        <Field label="Job title" hint="Optional"><input className="cp-input" value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
        <Field label="Department" hint="Optional, type a new one to create it">
          <input className="cp-input" list="cp-invite-depts" value={f.dept} onChange={(e) => set("dept", e.target.value)} />
          <datalist id="cp-invite-depts">{db.departments.map((d) => <option key={d} value={d} />)}</datalist>
        </Field>
        <Field label="Reports to" hint="Optional">
          <select className="cp-input" value={f.managerId} onChange={(e) => set("managerId", e.target.value)}>
            <option value="">— nobody —</option>
            {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}

function EmployeeForm({ emp, isNew, db, onSave, onCancel }) {
  const companyWork = db.work || {};
  const [f, setF] = useState({
    ...emp, checkPrefs: emp.checkPrefs || {},
    // Back-compat: an employee saved before this feature existed has neither
    // field set, which should behave exactly as "pattern" always did; one
    // saved by the very first version of per-day hours has a weekSchedule
    // but no scheduleMode yet, which should come back as "custom".
    scheduleMode: emp.scheduleMode || (emp.weekSchedule ? "custom" : "pattern"),
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const setBal = (k, v) => setF((x) => ({ ...x, bal: { ...x.bal, [k]: Number(v) || 0 } }));
  const setPay = (k, v) => setF((x) => ({ ...x, pay: { ...emptyPay(), ...(x.pay || {}), [k]: Number(String(v).replace(/[^0-9]/g, "")) || 0 } }));
  const setDaySched = (day, patch) => setF((x) => ({
    ...x,
    weekSchedule: { ...(x.weekSchedule || {}), [day]: { ...(x.weekSchedule?.[day] || {}), ...patch } },
  }));
  const branch = f.branchId ? (db.branches || []).find((b) => b.id === f.branchId) : null;
  return (
    <Modal wide title={isNew ? "Add employee" : `Edit ${emp.name || "employee"}`} onClose={onCancel}
      onSubmit={() => onSave({
        ...f,
        weekSchedule: f.scheduleMode === "custom" ? (f.weekSchedule || null) : null,
        // Clear a leftover shiftId from a previous "Shift pattern" choice —
        // otherwise shiftFor()'s fallback (used whenever "Standard"/"Branch"
        // mode has no hours set for a given day) silently picks up that
        // stale shift instead of the company/branch hours this screen just
        // told the admin it would follow.
        shiftId: f.scheduleMode === "pattern" ? (f.shiftId || "") : "",
      })}
      submitLabel={isNew ? "Add employee" : "Save changes"}>
      <FormGroup title="Personal">
        <div className="cp-form-grid">
          <Field label="Full name"><input className="cp-input" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Bola Ade" /></Field>
          <Field label="Email"><input className="cp-input" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Phone"><input className="cp-input" value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+234 …" /></Field>
          <Field label="Date of birth"><input type="date" className="cp-input" value={f.dob} onChange={(e) => set("dob", e.target.value)} /></Field>
          <Field label="Gender"><input className="cp-input" value={f.gender} onChange={(e) => set("gender", e.target.value)} /></Field>
          <Field label="Marital status"><input className="cp-input" value={f.marital} onChange={(e) => set("marital", e.target.value)} /></Field>
          <Field label="Home area"><input className="cp-input" value={f.area} onChange={(e) => set("area", e.target.value)} placeholder="e.g. Lekki, Lagos" /></Field>
        </div>
      </FormGroup>

      <FormGroup title="Job">
        <div className="cp-form-grid">
          <Field label="Job title"><input className="cp-input" value={f.title} onChange={(e) => set("title", e.target.value)} /></Field>
          <Field label="Department" hint="Type a new one to create it">
            <input className="cp-input" list="cp-depts" value={f.dept} onChange={(e) => set("dept", e.target.value)} />
            <datalist id="cp-depts">{db.departments.map((d) => <option key={d} value={d} />)}</datalist>
          </Field>
          <Field label="Reports to">
            <select className="cp-input" value={f.managerId} onChange={(e) => set("managerId", e.target.value)}>
              <option value="">— nobody —</option>
              {db.employees.filter((e) => e.id !== f.id).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <Field label="Start date"><input type="date" className="cp-input" value={f.joined} onChange={(e) => set("joined", e.target.value)} /></Field>
          <Field label="Contract type">
            <select className="cp-input" value={f.contract} onChange={(e) => set("contract", e.target.value)}>
              {["Full-time", "Part-time", "Contract", "Intern", "NYSC"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="cp-input" value={f.status} onChange={(e) => set("status", e.target.value)}>
              {["Active", "On leave", "Probation", "Suspended", "Exited"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Branch">
            <select className="cp-input" value={f.branchId || ""} onChange={(e) => set("branchId", e.target.value)}>
              <option value="">— not assigned —</option>
              {(db.branches || []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Contract ends" hint="Leave blank for permanent staff">
            <input type="date" className="cp-input" value={f.contractEnd || ""} onChange={(e) => set("contractEnd", e.target.value)} />
          </Field>
        </div>
      </FormGroup>

      <FormGroup title="Working hours" note="Drives lateness and overtime for this person.">
        <div className="cp-tabs" style={{ marginBottom: 14, flexWrap: "wrap" }}>
          <button type="button" className={"cp-tab" + (f.scheduleMode === "standard" ? " active" : "")} onClick={() => set("scheduleMode", "standard")}>Standard hours</button>
          <button type="button" className={"cp-tab" + (f.scheduleMode === "branch" ? " active" : "")} onClick={() => set("scheduleMode", "branch")}>Branch hours</button>
          <button type="button" className={"cp-tab" + (f.scheduleMode === "custom" ? " active" : "")} onClick={() => set("scheduleMode", "custom")}>Custom hours</button>
          <button type="button" className={"cp-tab" + (f.scheduleMode === "pattern" ? " active" : "")} onClick={() => set("scheduleMode", "pattern")}>Shift pattern</button>
        </div>

        {f.scheduleMode === "standard" && (
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 9, padding: "10px 13px" }}>
            Follows the company's working hours exactly, set in <b>Settings → Working hours</b>
            {db.work?.weekSchedule ? " (different hours are set for different days there)." : ` (currently ${db.work?.dayStart}–${db.work?.dayEnd} every working day).`}
            {" "}Best for most full-time and part-time staff who all keep the same hours as the office.
          </div>
        )}

        {f.scheduleMode === "branch" && (
          <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.55, background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 9, padding: "10px 13px" }}>
            {branch
              ? <>Follows <b>{branch.name}</b>'s hours, set in <b>Settings → Branches</b>{branch.useCompanySchedule === false ? " (this branch has its own hours)." : " (currently following the company's hours)."}</>
              : <>No branch is assigned above, so this will just follow the company's working hours until one is. Pick a branch under <b>Job → Branch</b> to use its hours instead.</>}
          </div>
        )}

        {f.scheduleMode === "pattern" && (
          <div className="cp-form-grid">
            <Field label="Shift pattern" hint="One start/end time, the same every working day — for shift workers, night workers, and contract staff">
              <select className="cp-input" value={f.shiftId || ""} onChange={(e) => set("shiftId", e.target.value)}>
                <option value="">Company working day ({db.work?.dayStart}–{db.work?.dayEnd})</option>
                {(db.work?.shifts || []).map((sh) => <option key={sh.id} value={sh.id}>{sh.name} ({sh.start}–{sh.end})</option>)}
              </select>
            </Field>
          </div>
        )}

        {f.scheduleMode === "custom" && (
          <WeekScheduleEditor schedule={f.weekSchedule} onChangeDay={setDaySched}
            note="Leave a day's times blank to fall back to this person's shift pattern (or the company default) for that day only." />
        )}
      </FormGroup>

      <FormGroup title="Pay & statutory" note="Only HR Admins can see these fields.">
        <div className="cp-form-grid">
          <Field label="Basic (₦/month)"><input className="cp-input" value={f.pay?.basic || ""} onChange={(e) => setPay("basic", e.target.value)} /></Field>
          <Field label="Transport allowance (₦)"><input className="cp-input" value={f.pay?.transport || ""} onChange={(e) => setPay("transport", e.target.value)} /></Field>
          <Field label="Other allowance (₦)"><input className="cp-input" value={f.pay?.other || ""} onChange={(e) => setPay("other", e.target.value)} /></Field>
          <Field label="Annual rent paid (₦)" hint="Drives rent relief — 20%, capped at ₦500k"><input className="cp-input" value={f.pay?.annualRent || ""} onChange={(e) => setPay("annualRent", e.target.value)} /></Field>
          <Field label="Pension rate (%)" hint="Blank uses the company default"><input className="cp-input" value={f.pay?.pensionRate ?? ""} onChange={(e) => setF((x) => ({ ...x, pay: { ...x.pay, pensionRate: e.target.value === "" ? null : Number(e.target.value.replace(/[^0-9.]/g, "")) } }))} /></Field>
          <Field label="NHIS (₦/month)"><input className="cp-input" value={f.pay?.nhis || ""} onChange={(e) => setPay("nhis", e.target.value)} /></Field>
          <Field label="Life insurance (₦/month)"><input className="cp-input" value={f.pay?.lifeIns || ""} onChange={(e) => setPay("lifeIns", e.target.value)} /></Field>
          <Field label="Mortgage interest (₦/month)"><input className="cp-input" value={f.pay?.mortgage || ""} onChange={(e) => setPay("mortgage", e.target.value)} /></Field>
        </div>
        <div style={{ marginTop: 12, background: "var(--brand-soft)", borderRadius: 10, padding: "10px 13px", fontSize: 12.5, color: "var(--brand)", fontWeight: 600 }}>
          Gross monthly: {naira((Number(f.pay?.basic) || 0) + (Number(f.pay?.transport) || 0) + (Number(f.pay?.other) || 0))}
        </div>
      </FormGroup>

      <FormGroup title="Statutory identifiers" note="Only HR Admins can see these fields.">
        <div className="cp-form-grid">
          <Field label="NIN"><input className="cp-input" value={f.nin} onChange={(e) => set("nin", e.target.value)} /></Field>
          <Field label="BVN"><input className="cp-input" value={f.bvn || ""} onChange={(e) => set("bvn", e.target.value.replace(/[^0-9]/g, "").slice(0, 11))} /></Field>
          <Field label="TIN"><input className="cp-input" value={f.tin} onChange={(e) => set("tin", e.target.value)} /></Field>
          <Field label="Pension RSA PIN"><input className="cp-input" value={f.pension} onChange={(e) => set("pension", e.target.value)} /></Field>
          <Field label="Bank"><input className="cp-input" value={f.bank} onChange={(e) => set("bank", e.target.value)} placeholder="e.g. GTBank" /></Field>
          <Field label="Account name"><input className="cp-input" value={f.acctName} onChange={(e) => set("acctName", e.target.value)} /></Field>
          <Field label="Account number (NUBAN)"><input className="cp-input" value={f.acct} onChange={(e) => set("acct", e.target.value.replace(/[^0-9]/g, "").slice(0, 10))} /></Field>
        </div>
      </FormGroup>

      <FormGroup title="Clock-in checks for this person" note="Leave on the company setting unless this person needs different treatment.">
        <div className="cp-form-grid">
          {[
            { k: "requireLocation", label: "Location (GPS)" },
            { k: "requireDevice", label: "Registered device" },
            { k: "requireSelfie", label: "Selfie at clock-in" },
            { k: "recordIP", label: "IP address" },
            { k: "presenceChecks", label: "Mid-shift presence checks" },
            { k: "blockOffsite", label: "Hard-block off-site clock-in" },
          ].map(({ k, label }) => {
            const v = f.checkPrefs && typeof f.checkPrefs[k] === "boolean" ? String(f.checkPrefs[k]) : "default";
            return (
              <Field key={k} label={label}>
                <select className="cp-input" value={v} onChange={(e) => {
                  const next = { ...(f.checkPrefs || {}) };
                  if (e.target.value === "default") delete next[k];
                  else next[k] = e.target.value === "true";
                  setF((x) => ({ ...x, checkPrefs: next }));
                }}>
                  <option value="default">Company setting ({companyWork && companyWork[k] ? "on" : "off"})</option>
                  <option value="true">Always on for this person</option>
                  <option value="false">Never for this person</option>
                </select>
              </Field>
            );
          })}
        </div>
        {hasOverrides(f) && (
          <div style={{ marginTop: 12, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Badge tone="accent">This person differs from the company setting</Badge>
            <button className="cp-link" onClick={() => setF((x) => ({ ...x, checkPrefs: {} }))}>Reset to company defaults</button>
          </div>
        )}
      </FormGroup>

      <FormGroup title="Leave balances & contacts">
        <div className="cp-form-grid">
          <Field label="Annual days"><input className="cp-input" value={f.bal.annual} onChange={(e) => setBal("annual", e.target.value)} /></Field>
          <Field label="Sick days"><input className="cp-input" value={f.bal.sick} onChange={(e) => setBal("sick", e.target.value)} /></Field>
          <Field label="Compassionate days"><input className="cp-input" value={f.bal.comp} onChange={(e) => setBal("comp", e.target.value)} /></Field>
          <Field label="Next of kin"><input className="cp-input" value={f.kin} onChange={(e) => set("kin", e.target.value)} /></Field>
          <Field label="Emergency contact"><input className="cp-input" value={f.emergency} onChange={(e) => set("emergency", e.target.value)} /></Field>
        </div>
      </FormGroup>
    </Modal>
  );
}
function FormGroup({ title, note, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>{title}</div>
      {note && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, display: "flex", gap: 6, alignItems: "center" }}><Lock size={12} /> {note}</div>}
      {children}
    </div>
  );
}

function ProfileDrawer({ emp, manager, isHR, isManager, isSelf, onClose }) {
  return (
    <div className="cp-drawer-wrap" onClick={onClose}>
      <div className="cp-drawer" onClick={(e) => e.stopPropagation()}>
        <button className="cp-drawer-close" onClick={onClose}><X size={16} /></button>
        <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 18 }}>
          <EmpAvatar emp={emp} size={56} />
          <div>
            <h3 style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, margin: 0, letterSpacing: "-0.02em" }}>{emp.name}</h3>
            <div style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600 }}>{emp.title || "—"}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{emp.dept || "—"} · joined {fmtShort(emp.joined)}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <Badge tone={emp.status === "Active" ? "ok" : "accent"}>{emp.status}</Badge>
          <Badge tone="muted">{emp.contract}</Badge>
          {emp.marital && <Badge tone="muted">{emp.marital}</Badge>}
          {emp.profileLocked && <Badge tone="warn"><Lock size={10} /> Profile locked</Badge>}
        </div>
        <DrawerGroup title="Contact">
          <KV icon={Mail} k="Email" v={emp.email} />
          <KV icon={Phone} k="Phone" v={emp.phone} mono />
          <KV icon={MapPin} k="Area" v={emp.area} />
          <KV icon={Users} k="Emergency contact" v={emp.emergency} />
        </DrawerGroup>
        <DrawerGroup title="Employment">
          <KV icon={Briefcase} k="Job title" v={emp.title} />
          <KV icon={Building2} k="Department" v={emp.dept} />
          <KV icon={Users2} k="Reports to" v={manager ? manager.name : "—"} />
        </DrawerGroup>
        {(isHR || isSelf) && (
          <DrawerGroup title="Pay & statutory" locked>
            {isHR && <KV icon={Wallet} k="Gross monthly" v={naira(grossOf(emp))} mono />}
            <KV icon={CreditCard} k="BVN" v={emp.bvn} mono />
            <KV icon={ShieldCheck} k="NIN" v={emp.nin} mono />
            <KV icon={CreditCard} k="TIN" v={emp.tin} mono />
            <KV icon={Landmark} k="Pension (RSA PIN)" v={emp.pension} mono />
            <KV icon={Landmark} k="Bank" v={emp.bank ? `${emp.bank} · ${emp.acct}` : ""} mono />
            <KV icon={Users} k="Next of kin" v={emp.kin} />
          </DrawerGroup>
        )}
        {isHR && hasOverrides(emp) && (
          <DrawerGroup title="Clock-in checks">
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", paddingTop: 4 }}>
              {CHECK_KEYS.filter((k) => typeof emp.checkPrefs[k] === "boolean").map((k) => (
                <Badge key={k} tone={emp.checkPrefs[k] ? "ok" : "muted"}>
                  {({ requireLocation: "Location", blockOffsite: "Hard block", requireDevice: "Device",
                      requireSelfie: "Selfie", recordIP: "IP", presenceChecks: "Presence checks" })[k]}
                  {emp.checkPrefs[k] ? " · on" : " · off"}
                </Badge>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
              Set for this person only. Everything else follows the company setting.
            </div>
          </DrawerGroup>
        )}

        {/* Leave balance is personal — HR, this person's own manager, or the
            person themselves, not just anyone browsing the directory. */}
        {(isHR || isManager || isSelf) && (
          <DrawerGroup title="Leave balance">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", paddingTop: 4 }}>
              <BalanceChip label="Annual" left={emp.bal.annual} />
              <BalanceChip label="Sick" left={emp.bal.sick} />
              <BalanceChip label="Compassionate" left={emp.bal.comp} />
            </div>
          </DrawerGroup>
        )}
      </div>
    </div>
  );
}
function DrawerGroup({ title, children, locked }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
        {title}{locked && <Lock size={11} />}
      </div>
      {children}
    </div>
  );
}
function BalanceChip({ label, left }) {
  return (
    <div style={{ background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 12px", minWidth: 96 }}>
      <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 500 }}>{label}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 600 }}>{left}<span style={{ fontSize: 11.5, color: "var(--muted)" }}> days left</span></div>
    </div>
  );
}


export { EmployeesPage, EmployeeForm, FormGroup, ProfileDrawer, DrawerGroup, BalanceChip };
