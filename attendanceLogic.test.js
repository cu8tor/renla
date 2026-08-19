/* =====================================================================
   attendanceLogic.test.js

   Locks in the specific behaviour the blueprint calls out as tested by
   hand: "20:00–04:00 computes as 8 hours" and "lateness correct for
   someone clocking in at 00:10 for a 20:00 start" — both night-shift,
   midnight-crossing scenarios that the old code got wrong (the
   blueprint notes it used to compute as minus sixteen hours).
   ===================================================================== */

import { describe, it, expect } from "vitest";
import {
  crossesMidnight,
  minutesBetween,
  dayKeyFor,
  shiftFor,
  lateMinutesAgainst,
  overtimeMinutes,
  effectiveWork,
  shiftMins,
} from "./attendanceLogic.js";

describe("crossesMidnight", () => {
  it("is true for a shift that runs past midnight", () => {
    expect(crossesMidnight("20:00", "04:00")).toBe(true);
  });
  it("is false for an ordinary day shift", () => {
    expect(crossesMidnight("09:00", "17:00")).toBe(false);
  });
});

describe("minutesBetween — the night-shift regression test", () => {
  it("computes a 20:00–04:00 night shift as exactly 8 hours (480 minutes)", () => {
    // This is the exact case the blueprint calls out: under the old code
    // this shift computed as minus sixteen hours instead of plus eight.
    expect(minutesBetween("20:00", "04:00")).toBe(480);
  });

  it("computes an ordinary day shift correctly too", () => {
    expect(minutesBetween("09:00", "17:00")).toBe(480);
  });
});

describe("lateMinutesAgainst — the blueprint's specific worked example", () => {
  it("correctly measures lateness for someone clocking in at 00:10 against a 20:00 shift start", () => {
    // 20:00 -> 00:10 is 4h10m (250 minutes) late by the clock, even though
    // "00:10" is numerically far smaller than "20:00" — the naive
    // subtraction (10 - 1200 = -1190) would be nonsense without the
    // midnight-wrap correction this function applies.
    const graceMins = 15;
    expect(lateMinutesAgainst("20:00", "00:10", graceMins)).toBe(235); // 250 - 15 grace
  });

  it("returns 0 for someone on time or early", () => {
    expect(lateMinutesAgainst("09:00", "08:55", 15)).toBe(0);
    expect(lateMinutesAgainst("09:00", "09:05", 15)).toBe(0); // inside grace
  });
});

describe("overtimeMinutes", () => {
  it("measures overtime from the shift's end, correctly across midnight", () => {
    const nightShift = { end: "04:00" };
    expect(overtimeMinutes(nightShift, "20:05", "04:30")).toBe(30); // 30 min past 04:00
  });

  it("earns nothing for arriving early — overtime is from shift end, not total hours", () => {
    const dayShift = { end: "17:00" };
    // clocked out at 16:00, before the shift even ended
    expect(overtimeMinutes(dayShift, "09:00", "16:00")).toBe(0);
  });

  it("returns 0 when clock-in or clock-out is missing", () => {
    expect(overtimeMinutes({ end: "17:00" }, "", "18:00")).toBe(0);
    expect(overtimeMinutes({ end: "17:00" }, "09:00", "")).toBe(0);
  });
});

describe("shiftFor", () => {
  it("returns the employee's named shift when they have one", () => {
    const work = { shifts: [{ id: "night", name: "Night shift", start: "20:00", end: "04:00" }] };
    expect(shiftFor(work, { shiftId: "night" })).toEqual(
      { id: "night", name: "Night shift", start: "20:00", end: "04:00" }
    );
  });

  it("falls back to the company's default working day when the employee has no shift", () => {
    const work = { dayStart: "08:30", dayEnd: "16:30" };
    expect(shiftFor(work, {})).toEqual({ id: "", name: "Working day", start: "08:30", end: "16:30" });
  });
});

describe("dayKeyFor", () => {
  it("maps an ISO date to the matching day-of-week key, Monday-indexed", () => {
    expect(dayKeyFor("2024-01-01")).toBe("Mon"); // known Monday
    expect(dayKeyFor("2024-01-06")).toBe("Sat"); // known Saturday
    expect(dayKeyFor("2024-01-07")).toBe("Sun"); // known Sunday
  });
  it("returns null for a missing or unparseable date", () => {
    expect(dayKeyFor("")).toBe(null);
    expect(dayKeyFor(null)).toBe(null);
  });
});

describe("shiftFor — scheduleMode resolution (per-day hours)", () => {
  const work = {
    dayStart: "09:00", dayEnd: "17:00",
    shifts: [{ id: "night", name: "Night shift", start: "20:00", end: "04:00" }],
  };

  it("ignores every per-day source when no date is given — same as before this feature existed", () => {
    const emp = { scheduleMode: "custom", weekSchedule: { Mon: { start: "10:00", end: "14:00" } } };
    expect(shiftFor(work, emp)).toEqual({ id: "", name: "Working day", start: "09:00", end: "17:00" });
  });

  it("mode \"custom\": uses the employee's own per-day hours for that date", () => {
    const emp = { scheduleMode: "custom", weekSchedule: { Mon: { start: "10:00", end: "14:00" }, Sat: { off: true } } };
    expect(shiftFor(work, emp, "2024-01-01")).toEqual({ id: "", name: "Mon", start: "10:00", end: "14:00" });
    expect(shiftFor(work, emp, "2024-01-06")).toEqual({ id: "", name: "Sat — day off", start: "", end: "", off: true });
  });

  it("mode \"custom\" falls back to the pattern for a day left unset", () => {
    const emp = { scheduleMode: "custom", weekSchedule: { Mon: { start: "10:00", end: "14:00" } }, shiftId: "night" };
    expect(shiftFor(work, emp, "2024-01-07")).toEqual({ id: "night", name: "Night shift", start: "20:00", end: "04:00" });
  });

  it("mode \"standard\" uses the company's day-varying default", () => {
    const w = { ...work, weekSchedule: { Sat: { start: "10:00", end: "16:00" } } };
    const emp = { scheduleMode: "standard" };
    expect(shiftFor(w, emp, "2024-01-06")).toEqual({ id: "", name: "Sat", start: "10:00", end: "16:00" });
    // Monday isn't set in the company's weekSchedule, so it falls back to dayStart/dayEnd.
    expect(shiftFor(w, emp, "2024-01-01")).toEqual({ id: "", name: "Working day", start: "09:00", end: "17:00" });
  });

  it("mode \"branch\" follows the branch's own hours when it has opted out of the company schedule", () => {
    const branches = [{ id: "br-1", useCompanySchedule: false, weekSchedule: { Sat: { start: "10:00", end: "16:00" } } }];
    const emp = { scheduleMode: "branch", branchId: "br-1" };
    expect(shiftFor(work, emp, "2024-01-06", branches)).toEqual({ id: "", name: "Sat", start: "10:00", end: "16:00" });
  });

  it("mode \"branch\" follows the company schedule when the branch hasn't opted out", () => {
    const branches = [{ id: "br-1", useCompanySchedule: true }];
    const w = { ...work, weekSchedule: { Sat: { start: "10:00", end: "16:00" } } };
    const emp = { scheduleMode: "branch", branchId: "br-1" };
    expect(shiftFor(w, emp, "2024-01-06", branches)).toEqual({ id: "", name: "Sat", start: "10:00", end: "16:00" });
  });

  it("mode \"branch\" falls back to the pattern when the employee has no branch assigned", () => {
    const emp = { scheduleMode: "branch", shiftId: "night" };
    expect(shiftFor(work, emp, "2024-01-06", [])).toEqual({ id: "night", name: "Night shift", start: "20:00", end: "04:00" });
  });

  it("defaults an employee with no scheduleMode but a weekSchedule to \"custom\" (back-compat)", () => {
    const emp = { weekSchedule: { Mon: { start: "10:00", end: "14:00" } } };
    expect(shiftFor(work, emp, "2024-01-01")).toEqual({ id: "", name: "Mon", start: "10:00", end: "14:00" });
  });

  it("defaults an employee with neither field to \"pattern\" (back-compat)", () => {
    const emp = { shiftId: "night" };
    expect(shiftFor(work, emp, "2024-01-01")).toEqual({ id: "night", name: "Night shift", start: "20:00", end: "04:00" });
  });
});

describe("effectiveWork — per-employee check overrides", () => {
  it("uses the company default when the employee has no override", () => {
    const work = { requireSelfie: true, requireDevice: false };
    expect(effectiveWork(work, {}).requireSelfie).toBe(true);
  });

  it("lets an explicit employee override win over the company default", () => {
    const work = { requireSelfie: true };
    const emp = { checkPrefs: { requireSelfie: false } };
    expect(effectiveWork(work, emp).requireSelfie).toBe(false);
  });
});

describe("shiftMins — night-shift regression (fixed)", () => {
  it("correctly sums an ordinary day shift", () => {
    expect(shiftMins({ start: "09:00", end: "17:00" })).toBe(480);
  });

  it("now correctly totals a night shift that crosses midnight as 480 minutes, not 0", () => {
    // Previously this did a plain Math.max(0, end - start), which returned 0
    // for any overnight shift because "04:00" is numerically smaller than
    // "20:00" — a night shift entered on the Rota totalled as 0 hours
    // instead of 8. Now delegates to minutesBetween, which is already
    // midnight-safe (see the tests above).
    expect(shiftMins({ start: "20:00", end: "04:00" })).toBe(480);
  });
});
