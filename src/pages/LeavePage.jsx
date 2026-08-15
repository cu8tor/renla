import { useState, useEffect, useCallback } from "react";
import { Plus, Check, X, MapPin, ShieldCheck, Info, Timer } from "lucide-react";
import { nowHM, hmToMin, durLabel } from "../features/attendance/attendanceLogic.js";
import { parseD, todayISO, fmtShort, daysInclusive } from "../lib/format.js";
import { getPosition, locErrLabel } from "../lib/geo.js";
import { Avatar, Badge, Card, Btn, Field, Section, PageHead, Empty, Modal } from "../components/ui.jsx";

const statusMeta = (s) => s === "approved" ? { tone: "ok", label: "Approved" }
  : s === "declined" ? { tone: "danger", label: "Declined" }
  : s === "pending_hr" ? { tone: "warn", label: "Pending HR" }
  : { tone: "warn", label: "Pending manager" };

function LeaveDecideRow({ l, emp, onDecide }) {
  return (
    <div className="cp-leaverow">
      <Avatar name={emp?.name || "?"} size={36} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{emp?.name || "Unknown"}</span>
          <Badge tone="brand">{l.type}</Badge>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{l.days} {l.days === 1 ? "day" : "days"}</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{fmtShort(l.from)} – {fmtShort(l.to)} · {l.reason}</div>
      </div>
      <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
        <button className="cp-mini cp-mini-ok" onClick={() => onDecide(l.id, true)}><Check size={14} /> Approve</button>
        <button className="cp-mini cp-mini-no" onClick={() => onDecide(l.id, false)}><X size={14} /></button>
      </div>
    </div>
  );
}
function LeaveInfoRow({ l, emp, showName }) {
  const m = statusMeta(l.status);
  return (
    <div className="cp-leaverow">
      {showName && emp && <Avatar name={emp.name} size={34} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {showName && emp && <span style={{ fontWeight: 600, fontSize: 13.5 }}>{emp.name}</span>}
          <Badge tone="brand">{l.type}</Badge>
          <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{fmtShort(l.from)} – {fmtShort(l.to)} · {l.days}d</span>
        </div>
        {l.reason && l.reason !== "—" && <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>{l.reason}</div>}
      </div>
      <Badge tone={m.tone}>{m.label}</Badge>
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
      {showName && emp && <Avatar name={emp.name} size={34} />}
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
                    ? <LeaveDecideRow key={l.id} l={l} emp={empById(l.empId)} onDecide={decideLeave} />
                    : <LeaveInfoRow key={l.id} l={l} emp={empById(l.empId)} showName={isHR || isManager} />;
                })}
              </div>}
          </Section>
        </Card>
        <Card>
          <Section title="History">
            {decided.length === 0 ? <Empty text="Nothing here yet." /> :
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {decided.map((l) => <LeaveInfoRow key={l.id} l={l} emp={empById(l.empId)} showName={isHR || isManager} />)}
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
