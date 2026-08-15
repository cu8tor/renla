import { useState } from "react";
import { CalendarRange, Plus, X, ChevronRight, Users2, Info, Timer, ChevronLeft, Copy } from "lucide-react";
import { DAYS, hmToMin, durLabel, addDays, mondayOf, shiftMins } from "../features/attendance/attendanceLogic.js";
import { parseD, iso, todayISO, fmtShort, fmtLong } from "../lib/format.js";
import { Avatar, Badge, Card, Btn, Stat, Field, PageHead, Empty, Modal } from "../components/ui.jsx";

function RotaPage({ db, isHR, isManager, myTeam, myEmp, empById, addShift, deleteShift, copyWeek }) {
  const [offset, setOffset] = useState(0);
  const [draft, setDraft] = useState(null);
  const canEdit = isHR || isManager;
  const weekStart = addDays(mondayOf(new Date()), offset * 7);
  const days = [...Array(7)].map((_, i) => addDays(weekStart, i));
  const dayKeys = days.map(iso);

  const people = isHR ? db.employees : isManager ? [...myTeam, myEmp].filter(Boolean) : myEmp ? [myEmp] : [];
  const shiftsFor = (empId, date) => db.shifts.filter((s) => s.empId === empId && s.date === date).sort((a, b) => a.start.localeCompare(b.start));
  const weekShifts = db.shifts.filter((s) => dayKeys.includes(s.date) && people.some((p) => p.id === s.empId));
  const totalHours = weekShifts.reduce((s, x) => s + shiftMins(x), 0);

  const label = offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `Week of ${fmtShort(iso(weekStart))}`;

  return (
    <div className="cp-fade">
      <PageHead title="Rota" sub={`${label} · ${fmtShort(iso(weekStart))} – ${fmtShort(iso(addDays(weekStart, 6)))}`}
        action={
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button className="cp-mini" onClick={() => setOffset(offset - 1)}><ChevronLeft size={14} /></button>
            <button className="cp-mini" onClick={() => setOffset(0)}>Today</button>
            <button className="cp-mini" onClick={() => setOffset(offset + 1)}><ChevronRight size={14} /></button>
            {canEdit && <Btn size="sm" variant="ghost" icon={Copy} onClick={() => copyWeek(addDays(weekStart, -7), weekStart)}>Copy last week</Btn>}
          </div>
        } />

      <div className="cp-tiles" style={{ marginBottom: 18 }}>
        <Stat icon={CalendarRange} label="Shifts this week" value={weekShifts.length} />
        <Stat icon={Timer} label="Hours scheduled" value={durLabel(totalHours)} />
        <Stat icon={Users2} label="People on rota" value={new Set(weekShifts.map((s) => s.empId)).size} tone="accent" />
      </div>

      {people.length === 0 ? <Card><Empty text="No people to schedule yet." /></Card> : (
        <Card pad={0}>
          <div className="cp-table-wrap">
            <table className="cp-table cp-rota">
              <thead>
                <tr>
                  <th style={{ minWidth: 160 }}>Person</th>
                  {days.map((d) => (
                    <th key={iso(d)} style={{ textAlign: "center" }}>
                      <div style={{ color: iso(d) === todayISO() ? "var(--brand)" : "inherit" }}>
                        {DAYS[(d.getDay() + 6) % 7]}<br /><span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{d.getDate()}</span>
                      </div>
                    </th>
                  ))}
                  <th style={{ textAlign: "right" }}>Hrs</th>
                </tr>
              </thead>
              <tbody>
                {people.map((p) => {
                  const mins = dayKeys.reduce((s, k) => s + shiftsFor(p.id, k).reduce((t, sh) => t + shiftMins(sh), 0), 0);
                  return (
                    <tr key={p.id}>
                      <td><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar name={p.name} size={30} /><div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div></div></td>
                      {dayKeys.map((k) => {
                        const list = shiftsFor(p.id, k);
                        const onLeave = db.leave.some((l) => l.empId === p.id && l.status === "approved" && parseD(l.from) <= parseD(k) && parseD(l.to) >= parseD(k));
                        return (
                          <td key={k} style={{ textAlign: "center", verticalAlign: "top", background: k === todayISO() ? "var(--brand-soft)" : undefined }}>
                            {onLeave && <div style={{ marginBottom: 4 }}><Badge tone="accent">Leave</Badge></div>}
                            {list.map((s) => (
                              <div key={s.id} className="cp-shift">
                                <span>{s.start}–{s.end}</span>
                                {s.note && <small>{s.note}</small>}
                                {canEdit && <button onClick={() => deleteShift(s.id)}><X size={11} /></button>}
                              </div>
                            ))}
                            {canEdit && <button className="cp-addshift" onClick={() => setDraft({ empId: p.id, date: k, start: db.work.dayStart, end: db.work.dayEnd, note: "" })}><Plus size={12} /></button>}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>{mins ? durLabel(mins) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {!canEdit && <div style={{ marginTop: 14, fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 7, alignItems: "center" }}><Info size={14} /> Your manager sets the rota. Ask them about changes.</div>}

      {draft && (
        <Modal title="Add shift" onClose={() => setDraft(null)} submitLabel="Add shift"
          onSubmit={() => { if (addShift(draft)) setDraft(null); }}>
          <div style={{ fontSize: 13.5, marginBottom: 16, color: "var(--muted)" }}>
            <b style={{ color: "var(--ink)" }}>{empById(draft.empId)?.name}</b> · {fmtLong(draft.date)}
          </div>
          <div className="cp-form-grid">
            <Field label="Start"><input type="time" className="cp-input" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} /></Field>
            <Field label="End"><input type="time" className="cp-input" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Field label="Note (optional)"><input className="cp-input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. Shop floor, Late shift" /></Field></div>
          {draft.start && draft.end && hmToMin(draft.end) > hmToMin(draft.start) && (
            <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--brand)", fontWeight: 600 }}>{durLabel(hmToMin(draft.end) - hmToMin(draft.start))} shift</div>
          )}
        </Modal>
      )}
    </div>
  );
}


export { RotaPage };
