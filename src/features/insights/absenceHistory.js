/* =====================================================================
   absenceHistory.js — one employee's attendance record over a date range,
   resolved day by day.

   monthInsights.js answers "how many days was this person absent this
   month" as a single number, derived by subtracting. That's the right
   shape for a dashboard tile and the wrong shape for HR asking "which
   days, exactly?" — a count can't be checked against anything. This
   walks the actual calendar instead, so every day it calls an absence is
   a date HR can look at and query.

   A day is only ever counted once, and the order below is the precedence:
   a public holiday is never an absence even if the person was also on
   leave, and a day someone clocked in is never an absence even if leave
   was also approved for it.
   ===================================================================== */

import { shiftFor } from "../attendance/attendanceLogic.js";
import { excursionDatesFor } from "../payroll/payrollEngine.js";

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };

/* Whether the calendar says this person was due at work on this date.

   shiftFor() knows about per-day schedules, branch hours and days off, but
   only for employees on a day-varying mode. Anyone on a flat shift pattern
   resolves to the same hours every day including Sunday, so for them the
   weekend rule comes from the company's payroll setting instead — without
   this, every Saturday would be reported as an absence. */
function isExpectedDay(db, emp, dateISO) {
  const holidays = db.holidays || [];
  if (holidays.some((h) => h.date === dateISO)) return false;

  const shift = shiftFor(db.work, emp, dateISO, db.sites || db.branches || []);
  if (shift && shift.off) return false;

  const mode = (emp && emp.scheduleMode) || (emp && emp.weekSchedule ? "custom" : "pattern");
  const dayVarying = mode === "custom" || mode === "branch" || mode === "standard";
  if (!dayVarying) {
    const wd = parse(dateISO).getDay();
    const sixDay = (db.payroll && db.payroll.workingDaysMode) === "calendar6";
    if (sixDay ? wd === 0 : (wd === 0 || wd === 6)) return false;
  }
  return true;
}

/* Walk `from`..`to` (inclusive, ISO dates) for one employee.

   Never looks past `today` — a working day still ahead of us isn't an
   absence, it just hasn't happened. Never looks before their start date
   either, so a recent hire isn't marked absent for the months before
   they were employed. */
function absenceHistory(db, emp, fromISO, toISO, today = new Date()) {
  const out = { expected: 0, present: 0, absent: [], leave: [], holidays: 0 };
  if (!emp) return out;

  const todayISO = iso(today);
  const start = parse(fromISO);
  const joined = emp.joined ? parse(emp.joined) : null;
  const realStart = joined && joined > start ? joined : start;
  const end = parse(toISO < todayISO ? toISO : todayISO);
  if (end < realStart) return out;

  const att = new Set((db.attendance || [])
    .filter((a) => a.empId === emp.id && a.clockIn)
    .map((a) => a.date));

  const approved = (db.leave || []).filter((l) => l.empId === emp.id && l.status === "approved");
  const leaveOn = (dateISO) => approved.find((l) => l.from <= dateISO && dateISO <= (l.to || l.from));

  // An approved excursion credits the day as worked — same rule payroll and
  // the dashboard already apply, so this can't disagree with them.
  const credited = new Set();
  const months = new Set();
  for (let d = new Date(realStart); d <= end; d.setDate(d.getDate() + 1)) {
    months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  months.forEach((mKey) => {
    excursionDatesFor(db.permissions || [], emp.id, mKey).forEach((d) => credited.add(d));
  });

  for (let d = new Date(realStart); d <= end; d.setDate(d.getDate() + 1)) {
    const key = iso(d);
    if (!isExpectedDay(db, emp, key)) {
      if ((db.holidays || []).some((h) => h.date === key)) out.holidays++;
      continue;
    }
    out.expected++;
    if (att.has(key) || credited.has(key)) { out.present++; continue; }
    const l = leaveOn(key);
    if (l) { out.leave.push({ date: key, type: l.type, id: l.id }); continue; }
    out.absent.push(key);
  }
  return out;
}

/* Every leave request for one person, newest first, whatever the status —
   HR wants to see the declined and pending ones too, not just what was
   approved. */
function leaveHistoryFor(db, empId) {
  return (db.leave || [])
    .filter((l) => l.empId === empId)
    .slice()
    .sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));
}

/* Approved days taken per leave type in one calendar year.

   Renla stores only what's LEFT in emp.bal — there's no entitlement figure
   anywhere, so "9 of 20" can't be shown honestly. This gives the other half
   of the picture from data that does exist: what they've actually used. If
   HR has hand-edited a balance, "left" and "taken" won't add up to a round
   number, which is correct — they genuinely don't. */
function leaveTakenByType(db, empId, year) {
  const prefix = String(year);
  const out = {};
  (db.leave || [])
    .filter((l) => l.empId === empId && l.status === "approved" && String(l.from).startsWith(prefix))
    .forEach((l) => { out[l.type] = (out[l.type] || 0) + (l.days || 0); });
  return out;
}

export { absenceHistory, isExpectedDay, leaveHistoryFor, leaveTakenByType };
