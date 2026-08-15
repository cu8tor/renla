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
/* The shift someone is on. Falls back to the company's working day. */
function shiftFor(work, emp) {
  const list = (work && work.shifts && work.shifts.length) ? work.shifts : DEFAULT_SHIFTS;
  const found = emp && emp.shiftId ? list.find((x) => x.id === emp.shiftId) : null;
  return found || { id: "", name: "Working day", start: (work && work.dayStart) || "09:00", end: (work && work.dayEnd) || "17:00" };
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

export { DAYS, pad2, nowHM, hmToMin, minToHM, durLabel, addDays, mondayOf, shiftMins, DEFAULT_SHIFTS, crossesMidnight, minutesBetween, shiftFor, lateMinutesAgainst, overtimeMinutes, CHECK_KEYS, effectiveWork, anyoneHas, hasOverrides };
