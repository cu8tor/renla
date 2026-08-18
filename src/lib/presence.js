import { hmToMin, addDays } from "../features/attendance/attendanceLogic.js";
import { iso, startOfToday } from "./format.js";

const DEFAULT_WORK = { dayStart: "09:00", dayEnd: "17:00", graceMins: 15,
  presenceChecks: false, checkTimes: ["12:00", "15:00"], checkWindowMins: 30,
  shifts: [{ id: "day", name: "Day shift", start: "09:00", end: "17:00" },
            { id: "night", name: "Night shift", start: "20:00", end: "04:00" }], requireLocation: false, blockOffsite: false, requireDevice: false, requireSelfie: false, recordIP: false };
async function fetchIP() {
  try {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const t = setTimeout(() => ctrl && ctrl.abort(), 4000);
    const r = await fetch("https://api.ipify.org?format=json", ctrl ? { signal: ctrl.signal } : {});
    clearTimeout(t);
    if (!r.ok) return null;
    const j = await r.json();
    return j && j.ip ? j.ip : null;
  } catch (e) { return null; }
}
function evaluateChecks({ work, sites, loc, deviceOk, selfie, ip }) {
  const checks = {};
  if (work.requireLocation) {
    checks.gps = !loc ? "fail" : loc.error ? "fail" : !sites.length ? "skip" : loc.inside ? "pass" : "fail";
  }
  if (work.requireDevice) checks.device = deviceOk ? "pass" : "fail";
  if (work.requireSelfie) checks.selfie = selfie ? "pass" : "fail";
  if (work.recordIP) checks.ip = ip ? "pass" : "skip";
  const required = Object.entries(checks).filter(([k]) => k !== "ip");
  const failed = required.filter(([, v]) => v === "fail").map(([k]) => k);
  return { checks, failed, status: failed.length ? "review" : "approved" };
}
const CHECK_LABEL = { gps: "Location", device: "Device", selfie: "Selfie", ip: "IP address" };
// Also used for presence-check records, which carry the same date/selfie
// shape — not just attendance (see App.jsx's update(), which now calls this
// for both on every change, not only at clock-in).
function pruneSelfies(list) {
  const cutoff = iso(addDays(startOfToday(), -90));
  return (list || []).map((a) => (a.date < cutoff && a.selfie ? { ...a, selfie: "" } : a));
}
function dueChecksFor(work, clockIn, clockOut, nowMin) {
  if (!work.presenceChecks || !clockIn) return [];
  const inMin = hmToMin(clockIn);
  const outMin = clockOut ? hmToMin(clockOut) : null;
  return (work.checkTimes || [])
    .filter((t) => {
      const m = hmToMin(t);
      if (m == null) return false;
      if (m < inMin) return false;              // before they arrived
      if (outMin != null && m > outMin) return false;  // after they left
      return m <= nowMin;                        // not yet due
    })
    .sort();
}
const checkState = (rec, dueTime, nowMin, windowMins) => {
  if (rec && rec.status === "confirmed") return "confirmed";
  if (rec && rec.status === "excused") return "excused";
  const due = hmToMin(dueTime);
  if (due == null) return "pending";
  return nowMin > due + (windowMins || 30) ? "missed" : "pending";
};

export { DEFAULT_WORK, fetchIP, evaluateChecks, CHECK_LABEL, pruneSelfies, dueChecksFor, checkState };
