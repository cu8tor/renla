import { resolveWorkingDays, elapsedWorkingDays, excusedLateDatesFor, excursionDatesFor } from "../payroll/payrollEngine.js";
import { minutesBetween, shiftFor, lateMinutesAgainst, overtimeMinutes, effectiveWork } from "../attendance/attendanceLogic.js";
import { grossOf, parseD, startOfToday } from "../../lib/format.js";

function isOnLeaveToday(leave, empId) {
  const t = startOfToday();
  return leave.some((l) => l.empId === empId && l.status === "approved" && parseD(l.from) <= t && parseD(l.to) >= t);
}
const blankBalances = () => ({ annual: 20, sick: 10, comp: 5 });

// How much of an approved leave request has actually been taken by `today`.
// Fully in the past → all of it. Entirely in the future → none. Straddling
// today → pro-rated across the request's calendar span, which is as close
// as we can get without knowing which individual days inside it were
// working days.
function elapsedLeaveDays(l, today) {
  const from = parseD(l.from), to = parseD(l.to || l.from);
  if (!from || from > today) return 0;
  if (!to || to <= today) return l.days;
  const span = Math.round((to - from) / 86400000) + 1;
  const done = Math.round((today - from) / 86400000) + 1;
  if (span <= 0) return l.days;
  return Math.min(l.days, Math.round((l.days * done) / span));
}

function monthInsights(db, employees, mKey, today = startOfToday()) {
  const work = db.work || {};
  const payroll = db.payroll || {};
  const inMonth = (d) => (d || "").startsWith(mKey);
  const att = db.attendance.filter((a) => inMonth(a.date) && a.clockIn);
  const ids = employees.map((e) => e.id);

  const perPerson = employees.map((emp) => {
    // Dateless shift — used only for the daily-rate/hourly-rate math below and
    // as the display fallback, since those need one representative shift, not
    // a per-day one. Actual lateness/overtime math uses the day-specific shift
    // (below), so an employee with a per-day weekSchedule is still measured
    // correctly against each day's own hours.
    const shift = shiftFor(work, emp);
    const w = effectiveWork(work, emp);
    const mine = att.filter((a) => a.empId === emp.id);
    const excused = excusedLateDatesFor(db.permissions || [], emp.id, mKey);
    let lateDays = 0, lateMins = 0, otMins = 0, workedMins = 0, noClockOut = 0;
    mine.forEach((a) => {
      const dayShift = shiftFor(work, emp, a.date, db.branches);
      const l = excused.includes(a.date) ? 0 : lateMinutesAgainst(dayShift.start, a.clockIn, w.graceMins);
      if (l > 0) { lateDays += 1; lateMins += l; }
      if (a.clockOut) {
        workedMins += minutesBetween(a.clockIn, a.clockOut) || 0;
        otMins += overtimeMinutes(dayShift, a.clockIn, a.clockOut);
      } else noClockOut += 1;
    });
    const gross = grossOf(emp);
    // Two different numbers, deliberately. The daily RATE divides a monthly
    // salary by the month's full working days — that doesn't change just
    // because the month is half over. What someone is EXPECTED to have
    // worked so far is the elapsed count; using the full month mid-September
    // treats every remaining day as an absence already taken.
    const workingDays = resolveWorkingDays(payroll, mKey, db.holidays || []);
    const elapsedDays = elapsedWorkingDays(payroll, mKey, db.holidays || [], today);
    const dailyRate = workingDays ? Math.round(gross / workingDays) : 0;
    const scheduledMins = Math.max(60, minutesBetween(shift.start, shift.end) || 480);
    const hourly = dailyRate / (scheduledMins / 60);

    // Leave still in the future hasn't been taken yet, so a 10-day booking
    // starting tomorrow shouldn't be deducted today.
    const takenSoFar = (l) => elapsedLeaveDays(l, today);
    const unpaid = (db.leave || []).filter((l) => l.empId === emp.id && l.status === "approved"
      && l.type === "Unpaid" && inMonth(l.from)).reduce((t, l) => t + takenSoFar(l), 0);
    const paidLeave = (db.leave || []).filter((l) => l.empId === emp.id && l.status === "approved"
      && l.type !== "Unpaid" && inMonth(l.from)).reduce((t, l) => t + takenSoFar(l), 0);
    const credited = excursionDatesFor(db.permissions || [], emp.id, mKey)
      .filter((d) => !mine.some((a) => a.date === d)).length;
    const expected = Math.max(0, elapsedDays - paidLeave);
    const present = mine.length + credited;
    const absentDays = Math.max(0, expected - present - unpaid);

    return {
      emp, shift, lateDays, lateMins, otMins, workedMins, noClockOut,
      daysPresent: present, expected, absentDays, unpaidDays: unpaid, dailyRate, hourly,
      absenceCost: (absentDays + unpaid) * dailyRate,
      overtimeCost: payroll.payOvertime ? Math.round((otMins / 60) * hourly * (payroll.overtimeRate || 1.5)) : 0,
      attendancePct: expected ? Math.round((present / expected) * 100) : null,
    };
  });

  const sum = (f) => perPerson.reduce((t, x) => t + f(x), 0);
  const rated = perPerson.filter((x) => x.attendancePct != null);
  return {
    perPerson,
    lateArrivals: sum((x) => x.lateDays),
    lateMinutes: sum((x) => x.lateMins),
    absenceCost: sum((x) => x.absenceCost),
    overtimeCost: sum((x) => x.overtimeCost),
    overtimeMins: sum((x) => x.otMins),
    missingClockOuts: sum((x) => x.noClockOut),
    attendancePct: rated.length ? Math.round(rated.reduce((t, x) => t + x.attendancePct, 0) / rated.length) : null,
    mostPunctual: [...perPerson]
      .filter((x) => x.daysPresent > 0)
      .sort((a, b) => (a.lateDays - b.lateDays) || (b.daysPresent - a.daysPresent))
      .slice(0, 10),
  };
}
function branchBreakdown(db, employees, mKey, today = startOfToday()) {
  const byBranch = {};
  const ins = monthInsights(db, employees, mKey, today);
  ins.perPerson.forEach((x) => {
    const b = x.emp.branchId || "unassigned";
    if (!byBranch[b]) byBranch[b] = { staff: 0, present: 0, expected: 0, late: 0, absenceCost: 0 };
    const t = byBranch[b];
    t.staff += 1; t.present += x.daysPresent; t.expected += x.expected;
    t.late += x.lateDays; t.absenceCost += x.absenceCost;
  });
  return Object.entries(byBranch).map(([id, t]) => ({
    id,
    name: id === "unassigned" ? "No branch" : ((db.branches || []).find((b) => b.id === id)?.name || "Unknown"),
    ...t,
    pct: t.expected ? Math.round((t.present / t.expected) * 100) : null,
  })).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
}

export { isOnLeaveToday, blankBalances, monthInsights, branchBreakdown };
