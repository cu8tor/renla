/* =====================================================================
   leaderboard.js — ranks employees by how early they tend to clock in,
   for the optional "punctuality leaderboard" feature. Off by default per
   company (see DEFAULT_LEADERBOARD, toggled in Settings) — some company
   cultures won't want gamified attendance at all.

   Deliberately ranks by *earliness*, not by penalising lateness or
   absence: a full "worst to best" list reads as public shaming of
   whoever's chronically late (traffic, family stuff, none of it always
   the employee's fault), so this only ever surfaces who's doing well.
   Someone who's merely on time every day still ranks below someone who's
   consistently early — the goal is celebrating the top of the table, not
   grading everyone.

   Every "was this early/late" comparison goes through shiftFor/
   clockInOffsetMinutes so a night-shift, branch-hours, or custom-hours
   employee is judged against their own real schedule for that date, not
   one flat company time — the same rule the rest of attendance/payroll
   already follows.
   ===================================================================== */

import { shiftFor, clockInOffsetMinutes } from "../features/attendance/attendanceLogic.js";

// Off by default — see the file header. HR opts in from Settings.
const DEFAULT_LEADERBOARD = { enabled: false };

// An employee needs at least this many clocked-in days in the window
// before they're ranked at all — otherwise one lucky early day (or one
// unlucky late one) for someone who's barely worked this month would
// swing wildly against people with a full month of real data.
const MIN_DAYS = 3;

// "YYYY-MM-DD" -> "YYYY-MM". No month argument needed elsewhere in this
// file — everything is scoped by comparing this prefix.
function monthKeyOf(dateStr) {
  return (dateStr || "").slice(0, 7);
}

/* Ranks every Active employee's clock-ins that fall within `monthKey`
   ("YYYY-MM", e.g. from monthKeyOf(todayISO())). Returns entries sorted
   best-first:
     { empId, name, title, avgEarly, days, streak, rank }
   avgEarly: average minutes early across their counted days this month
     (positive = early on average, negative = late on average — still
     shown, just ranked lower, rather than hidden, so "average of the
     days you did clock in" stays honest).
   streak: consecutive most-recent days (within the window, working
     backwards from their latest clock-in) that were on time or early —
     resets to 0 the moment a late day is hit. Purely a "fun" number for
     badges, not used for ranking.
   Employees under MIN_DAYS tracked days this month are left out of the
   ranked list entirely (not enough data yet), which the caller can
   reflect ("N people not yet ranked this month") rather than showing
   a misleading rank of 1 for someone with a single lucky day. */
function computeLeaderboard({ employees, attendance, work, branches, monthKey }) {
  const byEmp = new Map();
  for (const a of attendance || []) {
    if (!a.clockIn || monthKeyOf(a.date) !== monthKey) continue;
    if (!byEmp.has(a.empId)) byEmp.set(a.empId, []);
    byEmp.get(a.empId).push(a);
  }

  const ranked = [];
  for (const emp of employees || []) {
    if (emp.status && emp.status !== "Active") continue;
    const rows = (byEmp.get(emp.id) || []).slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (rows.length < MIN_DAYS) continue;

    const offsets = rows.map((a) => {
      const shift = shiftFor(work, emp, a.date, branches);
      const off = clockInOffsetMinutes(shift.start, a.clockIn);
      return off == null ? 0 : off;
    });
    const avgEarly = -(offsets.reduce((s, m) => s + m, 0) / offsets.length);

    let streak = 0;
    for (let i = offsets.length - 1; i >= 0; i--) {
      if (offsets[i] <= 0) streak++;
      else break;
    }

    ranked.push({ empId: emp.id, name: emp.name, title: emp.title || "", avgEarly, days: rows.length, streak });
  }

  ranked.sort((a, b) => (b.avgEarly - a.avgEarly) || (b.days - a.days) || a.name.localeCompare(b.name));
  ranked.forEach((r, i) => { r.rank = i + 1; });
  return ranked;
}

export { DEFAULT_LEADERBOARD, MIN_DAYS, monthKeyOf, computeLeaderboard };
