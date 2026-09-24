import { useState, useEffect, useCallback } from "react";
import { Plus, Check, X, MapPin, ShieldCheck, Info, Timer, Eye, CalendarDays } from "lucide-react";
import { nowHM, hmToMin, durLabel } from "../features/attendance/attendanceLogic.js";
import { parseD, todayISO, fmtShort, daysInclusive } from "../lib/format.js";
import { getPosition, locErrLabel } from "../lib/geo.js";
import { absenceHistory, leaveHistoryFor, leaveTakenByType } from "../features/insights/absenceHistory.js";
import { Avatar, EmpAvatar, Badge, Card, Btn, Field, Section, PageHead, Empty, Modal, Stat } from "../components/ui.jsx";

/* The three leave types with a tracked balance, in display order. Mirrors
   BAL_KEYS in leaveLogic.js — anything not here is granted without being
   counted against an allowance. */
const BAL_VIEW = [
  { key: "annual", label: "Annual" },
  { key: "sick", label: "Sick" },
  { key: "comp", label: "Compassionate" },
];

const statusMeta = (s) => s === "approved" ? { tone: "ok", label: "Approved" }
  : s === "declined" ? { tone: "danger", label: "Declined" }
  : s === "pending_hr" ? { tone: "warn", label: "Pending HR" }
  : { tone: "warn", label: "Pending manager" };

function LeaveDecideRow({ l, emp, onDecide, onView }) {
  return (
    <div className="cp-leaverow">
      <EmpAvatar emp={emp} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{emp?.name || "Unknown"}</span>
          <Badge tone="brand">{l.type}</Badge>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{l.days} {l.days === 1 ? "day" : "days"}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{fmtShort(l.from)} – {fmtShort(l.to)} · {l.reason}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
        {onView && <button className="cp-mini" onClick={() => onView(l)} title="See this person's record"><Eye size={14} /> View</button>}
        <button className="cp-mini cp-mini-ok" onClick={() => onDecide(l.id, true)}><Check size={14} /> Approve</button>
        <button className="cp-mini cp-mini-no" onClick={() => onDecide(l.id, false)}><X size={14} /></button>
      </div>
    </div>
  );
}
function LeaveInfoRow({ l, emp, showName, onView }) {
  const m = statusMeta(l.status);
  return (
    <div className="cp-leaverow">
      {showName && emp && <EmpAvatar emp={emp} size={34} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {showName && emp && <span style={{ fontWeight: 600, fontSize: 13.5 }}>{emp.name}</span>}
          <Badge tone="brand">{l.type}</Badge>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{fmtShort(l.from)} – {fmtShort(l.to)} · {l.days}d</span>
        </div>
        {l.reason && l.reason !== "—" && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{l.reason}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flex: "0 0 auto" }}>
        <Badge tone={m.tone}>{m.label}</Badge>
        {onView && <button className="cp-mini" onClick={() => onView(l)} title="See this person's record"><Eye size={14} /> View</button>}
      </div>
    </div>
  );
}

function PermBadge({ p }) {
  const m = p.status === "approved" ? { tone: "ok", label: "Approved" }
    : p.status === "declined" ? { tone: "danger", label: "Declined" }
    : p.status === "pending_hr" ? { tone: "warn", label: "Pending HR" }
    : { tone: "warn", label: "Pending manager" };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function PermRow({ p, emp, showName, canAct, onDecide }) {
  const isLate = p.kind === "late";
  return (
    <div className="cp-leaverow" style={{ alignItems: "flex-start" }}>
      {showName && emp && <EmpAvatar emp={emp} size={34} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {showName && emp && <span style={{ fontWeight: 600, fontSize: 13.5 }}>{emp.name}</span>}
          <Badge tone="brand">{isLate ? "Coming in late" : "Leaving the office"}</Badge>
          <Badge tone={p.category === "Official" ? "accent" : "muted"}>{p.category}</Badge>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {fmtShort(p.date)} · {isLate ? `arriving ${p.fromTime}` : `${p.fromTime} – ${p.toTime}`}
          </span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{p.reason}</div>
        {(p.area || p.loc) && (
          <div style={{ marginTop: 5, display: "flex", gap: 6, flexWrap: "wrap" }}>
            {p.area && <Badge tone="muted"><MapPin size={10} /> {p.area}</Badge>}
            {p.loc && <Badge tone="muted">{Number(p.loc.lat).toFixed(3)}, {Number(p.loc.lng).toFixed(3)}{p.capturedAt ? ` · at ${p.capturedAt}` : ""}</Badge>}
          </div>
        )}
      </div>
      {canAct
        ? <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
            <button className="cp-mini cp-mini-ok" onClick={() => onDecide(p.id, true)}><Check size={14} /> Approve</button>
            <button className="cp-mini cp-mini-no" onClick={() => onDecide(p.id, false)}><X size={14} /></button>
          </div>
        : <PermBadge p={p} />}
    </div>
  );
}


/* One person's attendance record, opened from any leave row. Answers the
   question a count can't: which days, and what happened on them. */

/* HR and managers need to reach someone's record whether or not they've
   ever requested leave — going in through a leave row only works for people
   who already have one, which misses exactly the person you're checking up
   on. This lists everyone in scope with their balances at a glance. */
function TeamLeaveCard({ people, db, onView }) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const rows = needle
    ? people.filter((e) => (e.name || "").toLowerCase().includes(needle) || (e.dept || "").toLowerCase().includes(needle))
    : people;

  return (
    <Card>
      <Section title={`Team leave · ${people.length}`}
        action={people.length > 6
          ? <input className="cp-input" style={{ maxWidth: 200, height: 32, fontSize: 13 }}
              placeholder="Find someone" value={q} onChange={(e) => setQ(e.target.value)} />
          : null}>
        {rows.length === 0 ? <Empty text="Nobody matches that." /> :
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {rows.map((e) => {
              const pending = (db.leave || []).filter((l) => l.empId === e.id && l.status.startsWith("pending")).length;
              return (
                <div key={e.id} className="cp-leaverow">
                  <EmpAvatar emp={e} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</span>
                      {pending > 0 && <Badge tone="warn">{pending} pending</Badge>}
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                      {BAL_VIEW.map((b) => `${e.bal?.[b.key] ?? 0} ${b.label.toLowerCase()}`).join(" · ")} left
                    </div>
                  </div>
                  <button className="cp-mini" onClick={() => onView(e)}><Eye size={14} /> View</button>
                </div>
              );
            })}
          </div>}
      </Section>
    </Card>
  );
}

function LeaveHistoryModal({ db, emp, onClose }) {
  const [months, setMonths] = useState(3);

  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - months + 1, 1);
  const fromISO = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-01`;
  const hist = absenceHistory(db, emp, fromISO, todayISO(), today);
  const requests = leaveHistoryFor(db, emp?.id);
  const year = today.getFullYear();
  const taken = leaveTakenByType(db, emp?.id, year);

  const rate = hist.expected ? Math.round((hist.present / hist.expected) * 100) : 0;

  return (
    <Modal title={emp?.name || "Leave history"} onClose={onClose} wide>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {[3, 6, 12].map((m) => (
          <button key={m} className={"cp-mini" + (months === m ? " cp-mini-ok" : "")} onClick={() => setMonths(m)}>
            Last {m} months
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        {BAL_VIEW.map(({ key, label }) => (
          <div key={key} style={{ flex: "1 1 140px", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 12, padding: "12px 14px" }}>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{label}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, marginTop: 2 }}>
              {emp?.bal?.[key] ?? 0}<span style={{ fontSize: 12.5, fontWeight: 500, color: "var(--muted)" }}> left</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
              {taken[label] || 0} taken in {year}
            </div>
          </div>
        ))}
      </div>

      <div className="cp-tiles" style={{ marginBottom: 18 }}>
        <Stat icon={Check} label="Days present" value={hist.present} sub={`of ${hist.expected} expected`} />
        <Stat icon={CalendarDays} label="On leave" value={hist.leave.length} sub="approved days" tone="accent" />
        <Stat icon={X} label="Unexplained" value={hist.absent.length} sub="no record, no leave" tone="accent" />
        <Stat icon={Timer} label="Attendance" value={`${rate}%`} sub={hist.holidays ? `${hist.holidays} public holidays skipped` : "excludes days off"} />
      </div>

      {Object.keys(taken).filter((t) => !BAL_VIEW.some((b) => b.label === t)).length > 0 && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 16, lineHeight: 1.6 }}>
          Also taken in {year}: {Object.entries(taken)
            .filter(([t]) => !BAL_VIEW.some((b) => b.label === t))
            .map(([t, n]) => `${n}d ${t.toLowerCase()}`).join(", ")}.
          These types have no tracked balance.
        </div>
      )}

      <Section title="Leave requests">
        {requests.length === 0 ? <Empty text="This person has never requested leave." /> :
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {requests.map((l) => <LeaveInfoRow key={l.id} l={l} emp={emp} showName={false} />)}
          </div>}
      </Section>

      <div style={{ marginTop: 18 }}>
        <Section title={`Days absent with no leave${hist.absent.length ? ` · ${hist.absent.length}` : ""}`}>
          {hist.absent.length === 0
            ? <Empty text="No unexplained absences in this period." />
            : <>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {hist.absent.map((d) => <Badge key={d} tone="warn">{fmtShort(d)}</Badge>)}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, lineHeight: 1.55 }}>
                  Working days with no clock-in and no approved leave. Days off, public holidays
                  and anything before they joined are left out, so these are days worth asking about.
                </div>
              </>}
        </Section>
      </div>
    </Modal>
  );
}

function LeavePage({ db, isHR, isManager, myTeam, myEmp, empById, decideLeave, applyLeave, requestPermission, decidePermission }) {
  const [tab, setTab] = useState("leave");
  const [permOpen, setPermOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [pf, setPf] = useState({ kind: "late", category: "Personal", date: todayISO(),
    fromTime: "", toTime: "", reason: "", area: "", loc: null, capturedAt: "" });
  const [locErr, setLocErr] = useState("");

  /* For a late request, where you are right now is part of the request.
     Captured once, when the form opens — not tracked afterwards. */
  const captureLocation = useCallback(async () => {
    setLocating(true); setLocErr("");
    const pos = await getPosition();
    setLocating(false);
    if (pos.error) { setLocErr(locErrLabel(pos.error)); return; }
    setPf((x) => ({ ...x,
      loc: { lat: +pos.lat.toFixed(4), lng: +pos.lng.toFixed(4), acc: pos.acc },
      capturedAt: nowHM() }));
  }, []);

  useEffect(() => {
    if (permOpen && pf.kind === "late" && !pf.loc) captureLocation();
  }, [permOpen, pf.kind]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ type: "Annual", from: "", to: "", reason: "" });
  // Only HR and managers get the record view — an employee looking at their
  // own request has no business opening a colleague's attendance history,
  // and their own is already the whole page.
  const [viewEmp, setViewEmp] = useState(null);
  const canViewRecords = isHR || isManager;
  const openRecord = canViewRecords ? (l) => setViewEmp(empById(l.empId) || null) : null;
  // HR sees the whole company; a manager sees only their own reports.
  const scopePeople = (isHR ? db.employees : myTeam).filter((e) => e.status === "Active");

  const relevant = isHR ? db.leave
    : isManager ? db.leave.filter((l) => myTeam.some((m) => m.id === l.empId) || l.empId === myEmp?.id)
    : db.leave.filter((l) => l.empId === myEmp?.id);
  const pending = relevant.filter((l) => l.status.startsWith("pending"));
  const decided = relevant.filter((l) => !l.status.startsWith("pending"));

  const perms = isHR ? db.permissions
    : isManager ? db.permissions.filter((x) => myTeam.some((m) => m.id === x.empId) || x.empId === myEmp?.id)
    : db.permissions.filter((x) => x.empId === myEmp?.id);
  const permPending = perms.filter((x) => x.status.startsWith("pending"));
  const permDecided = perms.filter((x) => !x.status.startsWith("pending"));
  const canActPerm = (x) => isHR || (isManager && x.status === "pending_manager" && myTeam.some((m) => m.id === x.empId));

  return (
    <div className="cp-fade">
      <PageHead title="Leave & permissions" sub={isHR ? "Company-wide" : isManager ? "Your team" : "Your requests"}
        action={myEmp && (tab === "leave"
          ? <Btn icon={Plus} onClick={() => setOpen(true)}>Request leave</Btn>
          : <Btn icon={Plus} onClick={() => setPermOpen(true)}>New request</Btn>)} />

      <div className="cp-tabs">
        <button className={"cp-tab" + (tab === "leave" ? " active" : "")} onClick={() => setTab("leave")}>Time off</button>
        <button className={"cp-tab" + (tab === "perm" ? " active" : "")} onClick={() => setTab("perm")}>
          Late &amp; stepping out{permPending.length ? ` · ${permPending.length}` : ""}
        </button>
      </div>

      {myEmp && (
        <div className="cp-tiles" style={{ marginBottom: 18 }}>
          <BalanceCard label="Annual leave" left={myEmp.bal.annual} />
          <BalanceCard label="Sick leave" left={myEmp.bal.sick} />
          <BalanceCard label="Compassionate" left={myEmp.bal.comp} />
        </div>
      )}

      {tab === "leave" && <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card>
          <Section title={`Pending${pending.length ? ` · ${pending.length}` : ""}`}>
            {pending.length === 0 ? <Empty text="No pending requests." /> :
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {pending.map((l) => {
                  const canAct = isHR || (isManager && l.status === "pending_manager" && myTeam.some((m) => m.id === l.empId));
                  return canAct
                    ? <LeaveDecideRow key={l.id} l={l} emp={empById(l.empId)} onDecide={decideLeave} onView={openRecord} />
                    : <LeaveInfoRow key={l.id} l={l} emp={empById(l.empId)} showName={isHR || isManager} onView={openRecord} />;
                })}
              </div>}
          </Section>
        </Card>
        {canViewRecords && scopePeople.length > 0 && (
          <TeamLeaveCard people={scopePeople} db={db} onView={setViewEmp} />
        )}
        <Card>
          <Section title="History">
            {decided.length === 0 ? <Empty text="Nothing here yet." /> :
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {decided.map((l) => <LeaveInfoRow key={l.id} l={l} emp={empById(l.empId)} showName={isHR || isManager} onView={openRecord} />)}
              </div>}
          </Section>
        </Card>
      </div>}

      {tab === "perm" && <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <Card>
          <Section title={`Awaiting approval${permPending.length ? ` · ${permPending.length}` : ""}`}>
            {permPending.length === 0 ? <Empty text="Nothing waiting." /> :
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {permPending.map((x) => <PermRow key={x.id} p={x} emp={empById(x.empId)}
                  showName={isHR || isManager} canAct={canActPerm(x)} onDecide={decidePermission} />)}
              </div>}
          </Section>
        </Card>
        <Card>
          <Section title="History">
            {permDecided.length === 0 ? <Empty text="Nothing here yet." /> :
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {permDecided.map((x) => <PermRow key={x.id} p={x} emp={empById(x.empId)}
                  showName={isHR || isManager} canAct={false} onDecide={decidePermission} />)}
              </div>}
          </Section>
        </Card>
        <div style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.55 }}>
          <Info size={14} style={{ marginTop: 1, flex: "0 0 auto" }} />
          <span>An approved late arrival means no lateness deduction for that day. Official time out of the office is never docked.</span>
        </div>
      </div>}

      {viewEmp && <LeaveHistoryModal db={db} emp={viewEmp} onClose={() => setViewEmp(null)} />}

      {permOpen && (
        <Modal title="New request" onClose={() => setPermOpen(false)} submitLabel="Send request"
          onSubmit={() => { if (requestPermission(pf)) { setPermOpen(false);
            setPf({ kind: "late", category: "Personal", date: todayISO(), fromTime: "", toTime: "", reason: "", area: "", loc: null, capturedAt: "" }); setLocErr(""); } }}>
          <Field label="What do you need?">
            <select className="cp-input" value={pf.kind} onChange={(e) => setPf({ ...pf, kind: e.target.value, fromTime: "", toTime: "" })}>
              <option value="late">I'll be coming in late</option>
              <option value="excursion">I need to leave the office during work hours</option>
            </select>
          </Field>

          <div className="cp-form-grid" style={{ marginTop: 14 }}>
            <Field label="Personal or official?">
              <select className="cp-input" value={pf.category} onChange={(e) => setPf({ ...pf, category: e.target.value })}>
                <option>Personal</option><option>Official</option>
              </select>
            </Field>
            <Field label="Date"><input type="date" className="cp-input" value={pf.date} onChange={(e) => setPf({ ...pf, date: e.target.value })} /></Field>
          </div>

          <div className="cp-form-grid" style={{ marginTop: 14 }}>
            {pf.kind === "late" ? (
              <Field label="Expected arrival time"><input type="time" className="cp-input" value={pf.fromTime} onChange={(e) => setPf({ ...pf, fromTime: e.target.value })} /></Field>
            ) : (<>
              <Field label="Leaving at"><input type="time" className="cp-input" value={pf.fromTime} onChange={(e) => setPf({ ...pf, fromTime: e.target.value })} /></Field>
              <Field label="Back by"><input type="time" className="cp-input" value={pf.toTime} onChange={(e) => setPf({ ...pf, toTime: e.target.value })} /></Field>
            </>)}
          </div>

          {pf.kind === "excursion" && pf.fromTime && pf.toTime && hmToMin(pf.toTime) > hmToMin(pf.fromTime) && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--brand)", fontWeight: 600 }}>
              {durLabel(hmToMin(pf.toTime) - hmToMin(pf.fromTime))} out of the office
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <Field label="Reason"><textarea className="cp-input" rows={3} value={pf.reason} onChange={(e) => setPf({ ...pf, reason: e.target.value })} placeholder="e.g. hospital appointment, bank, client meeting" /></Field>
          </div>

          <div style={{ marginTop: 14 }}>
            <Field label="Roughly where are you / will you be?" hint="An area is enough — no photo is taken">
              <input className="cp-input" value={pf.area} onChange={(e) => setPf({ ...pf, area: e.target.value })} placeholder="e.g. Yaba, Lagos" />
            </Field>
            <div style={{ marginTop: 10 }}>
              {locating ? (
                <Badge tone="muted"><Timer size={10} /> Finding where you are…</Badge>
              ) : pf.loc ? (
                <Badge tone="ok"><MapPin size={10} /> Location captured at {pf.capturedAt}</Badge>
              ) : (
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <Btn size="sm" variant="ghost" icon={MapPin} onClick={captureLocation}>Attach my location</Btn>
                  {locErr && <span style={{ fontSize: 12, color: "var(--warn)" }}>{locErr}</span>}
                </div>
              )}
            </div>
          </div>

          <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 7, alignItems: "flex-start", lineHeight: 1.5 }}>
            <ShieldCheck size={14} style={{ marginTop: 1, flex: "0 0 auto" }} />
            <span>{pf.kind === "late"
              ? "Approved in advance means no lateness deduction for that day."
              : "The day still counts as worked, even if you don't come back to clock out. Official time out is never docked; personal time only counts against you if your company has chosen to deduct it."}</span>
          </div>
        </Modal>
      )}

      {open && (
        <Modal title="Request leave" onClose={() => setOpen(false)} submitLabel="Submit request"
          onSubmit={() => { if (applyLeave(f)) { setOpen(false); setF({ type: "Annual", from: "", to: "", reason: "" }); } }}>
          <Field label="Leave type">
            <select className="cp-input" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              {["Annual", "Sick", "Compassionate", "Maternity", "Paternity", "Study", "Unpaid"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </Field>
          <div className="cp-form-grid" style={{ marginTop: 14 }}>
            <Field label="From"><input type="date" className="cp-input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
            <Field label="To"><input type="date" className="cp-input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
          </div>
          {f.from && f.to && parseD(f.to) >= parseD(f.from) && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--brand)", fontWeight: 600 }}>{daysInclusive(f.from, f.to)} days requested</div>
          )}
          <div style={{ marginTop: 14 }}>
            <Field label="Reason (optional)"><textarea className="cp-input" rows={3} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 7, alignItems: "center" }}>
            <ShieldCheck size={14} /> Goes to your manager, then HR for final sign-off.
          </div>
        </Modal>
      )}
    </div>
  );
}
function BalanceCard({ label, left }) {
  return (
    <Card pad={18}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600 }}>{left}</span>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 7 }}>days remaining</div>
    </Card>
  );
}


export { statusMeta, LeaveDecideRow, LeaveInfoRow, PermBadge, PermRow, LeavePage, BalanceCard };
