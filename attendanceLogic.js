/* =====================================================================
   attendanceLogic.js — extracted verbatim from App.jsx (V1 modularisation).
   Shift/lateness/overtime time math, including the night-shift-safe
   handling the blueprint specifically calls out as tested (a 20:00–04:00
   shift used to compute as minus sixteen hours before this logic existed).
   See attendanceLogic.test.js.
   ===================================================================== */

/* ---- time helpers (Phase 2) ---- */
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pad2 = (n) => String(n).padStart(2, "0");
const nowHM = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const hmToMin = (hm) => { if (!hm || !hm.includes(":")) return null; const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const minToHM = (min) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`;
const durLabel = (min) => { if (min == null || min < 0) return "—"; const h = Math.floor(min / 60), m = min % 60; return h ? `${h}h ${m ? m + "m" : ""}`.trim() : `${m}m`; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // Mon = 0
  return addDays(x, -wd);
}
/* Scheduled length of a shift, in minutes. Delegates to minutesBetween so a
   night shift (e.g. 20:00-04:00) is measured correctly across midnight,
   instead of the plain end-start subtraction this used to do — that older
   version returned 0 for any overnight shift because "04:00" is numerically
   smaller than "20:00". Used by the Rota page to total scheduled hours. */
const shiftMins = (s) => {
  const m = minutesBetween(s.start, s.end);
  return m == null ? 0 : m;
};

/* ================================================================== */
/*  SHIFT PATTERNS  (day and night)                                    */
/*  A night shift runs past midnight, so clock-out is "earlier" than   */
/*  clock-in by the clock. Everything below survives that.             */
/* ================================================================== */
const DEFAULT_SHIFTS = [
  { id: "day", name: "Day shift", start: "09:00", end: "17:00" },
  { id: "night", name: "Night shift", start: "20:00", end: "04:00" },
];
const crossesMidnight = (start, end) => {
  const a = hmToMin(start), b = hmToMin(end);
  return a != null && b != null && b <= a;
};
/* Minutes between two clock times, allowing for a shift that runs overnight. */
function minutesBetween(from, to) {
  const a = hmToMin(from), b = hmToMin(to);
  if (a == null || b == null) return null;
  return b >= a ? b - a : (1440 - a) + b;
}
/* Which day-of-week key (matching DAYS above) an ISO "YYYY-MM-DD" date falls
   on, parsed as a local date (not UTC) so it can't drift a day depending on
   the browser's timezone. */
function dayKeyFor(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  if (isNaN(dt.getTime())) return null;
  return DAYS[(dt.getDay() + 6) % 7]; // JS Sunday=0 → reindex so Monday=0, matching DAYS
}
/* Reads a single day out of a { Mon: {start,end}|{off:true}, ... } map.
   Returns null if that day isn't set at all (so the caller can fall
   through to the next thing in the chain), { off: true }, or
   { start, end }. */
function resolveWeekDay(schedule, key) {
  if (!schedule || !key) return null;
  const day = schedule[key];
  if (!day) return null;
  if (day.off) return { off: true };
  if (day.start && day.end) return { start: day.start, end: day.end };
  return null;
}
const dayOffShift = (key) => ({ id: "", name: key ? `${key} — day off` : "Day off", start: "", end: "", off: true });
const dayShift = (key, day) => ({ id: "", name: key, start: day.start, end: day.end });
/* The old single-shift-for-every-day fallback: the employee's assigned
   shift pattern if they have one, else the company's default working day. */
function patternShift(work, emp) {
  const list = (work && work.shifts && work.shifts.length) ? work.shifts : DEFAULT_SHIFTS;
  const found = emp && emp.shiftId ? list.find((x) => x.id === emp.shiftId) : null;
  return found || { id: "", name: "Working day", start: (work && work.dayStart) || "09:00", end: (work && work.dayEnd) || "17:00" };
}
/* The shift someone is on, for a given date (optional). An employee's
   `scheduleMode` picks which source of hours applies:
     "custom"   — their own per-day weekSchedule
     "branch"   — their branch's hours (which may itself just be following
                  the company's, or have its own override)
     "standard" — the company's day-varying default hours directly,
                  ignoring branch
     "pattern"  — (default) their assigned shift pattern, same start/end
                  every day — the original behaviour, for shift workers,
                  night workers, and anyone whose hours don't vary by day
   Missing `scheduleMode` defaults to "custom" if they have a weekSchedule
   (back-compat with the first version of this feature), else "pattern"
   (back-compat with every employee from before this feature existed).
   Any day that resolves to nothing under the chosen mode — including
   every mode when no date is given at all — falls through to the pattern.
   `branches` is only needed for "branch" mode; safe to omit otherwise. */
function shiftFor(work, emp, dateStr, branches) {
  const mode = (emp && emp.scheduleMode) || (emp && emp.weekSchedule ? "custom" : "pattern");
  const key = dateStr ? dayKeyFor(dateStr) : null;

  if (key) {
    if (mode === "custom") {
      const day = resolveWeekDay(emp.weekSchedule, key);
      if (day) return day.off ? dayOffShift(key) : dayShift(key, day);
    } else if (mode === "branch") {
      const branch = emp && emp.branchId ? (branches || []).find((b) => b.id === emp.branchId) : null;
      const useOwn = branch && branch.useCompanySchedule === false;
      const day = resolveWeekDay(useOwn ? branch.weekSchedule : (work && work.weekSchedule), key);
      if (day) return day.off ? dayOffShift(key) : dayShift(key, day);
    } else if (mode === "standard") {
      const day = resolveWeekDay(work && work.weekSchedule, key);
      if (day) return day.off ? dayOffShift(key) : dayShift(key, day);
    }
  }
  return patternShift(work, emp);
}
/* How late someone was, against their own shift start. Handles a night
   worker clocking in at 00:10 for a shift that began at 20:00 yesterday. */
function lateMinutesAgainst(shiftStart, clockIn, graceMins) {
  const start = hmToMin(shiftStart), inMin = hmToMin(clockIn);
  if (start == null || inMin == null) return 0;
  let diff = inMin - start;
  if (diff < -720) diff += 1440;
  if (diff > 720) diff -= 1440;
  return Math.max(0, diff - (Number(graceMins) || 0));
}
/* Minutes worked past the end of the shift. Measured from the shift's end,
   not total hours — otherwise arriving early would earn overtime. */
function overtimeMinutes(shift, clockIn, clockOut) {
  if (!clockIn || !clockOut) return 0;
  const after = minutesBetween(shift.end, clockOut);
  if (after == null) return 0;
  return after > 720 ? 0 : after;
}

/* ---- per-employee overrides of the company's clock-in checks ---- */
const CHECK_KEYS = ["requireLocation", "blockOffsite", "requireDevice", "requireSelfie", "recordIP", "presenceChecks"];
/* An employee follows the company setting unless their own record says otherwise. */
function effectiveWork(work, emp) {
  const prefs = (emp && emp.checkPrefs) || {};
  const out = { ...work };
  CHECK_KEYS.forEach((k) => { if (prefs[k] === true || prefs[k] === false) out[k] = prefs[k]; });
  return out;
}
/* Is a check switched on for anyone at all? Drives whether a column is worth showing. */
const anyoneHas = (work, employees, key) =>
  Boolean(work[key]) || (employees || []).some((e) => e.checkPrefs && e.checkPrefs[key] === true);
const hasOverrides = (emp) => Boolean(emp && emp.checkPrefs && CHECK_KEYS.some((k) => typeof emp.checkPrefs[k] === "boolean"));

export { DAYS, pad2, nowHM, hmToMin, minToHM, durLabel, addDays, mondayOf, shiftMins, DEFAULT_SHIFTS, crossesMidnight, minutesBetween, dayKeyFor, shiftFor, lateMinutesAgainst, overtimeMinutes, CHECK_KEYS, effectiveWork, anyoneHas, hasOverrides };
