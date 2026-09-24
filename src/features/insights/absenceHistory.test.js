import { describe, it, expect } from "vitest";
import { absenceHistory, isExpectedDay, leaveHistoryFor, leaveTakenByType } from "./absenceHistory.js";

/* September 2026: 1st is a Tuesday, 5th/6th the first weekend. */
const emp = { id: "e1", name: "Test", joined: "2026-01-01", scheduleMode: "pattern" };
const base = (over = {}) => ({
  work: { dayStart: "09:00", dayEnd: "17:00", shifts: [] },
  payroll: { workingDaysMode: "calendar" },
  holidays: [], attendance: [], leave: [], permissions: [], sites: [],
  ...over,
});
const att = (dates) => dates.map((date) => ({ empId: "e1", date, clockIn: "09:00" }));

describe("isExpectedDay", () => {
  it("excludes weekends for someone on a flat shift pattern", () => {
    const db = base();
    expect(isExpectedDay(db, emp, "2026-09-04")).toBe(true);   // Friday
    expect(isExpectedDay(db, emp, "2026-09-05")).toBe(false);  // Saturday
    expect(isExpectedDay(db, emp, "2026-09-06")).toBe(false);  // Sunday
  });

  it("includes Saturday when the company runs a six-day week", () => {
    const db = base({ payroll: { workingDaysMode: "calendar6" } });
    expect(isExpectedDay(db, emp, "2026-09-05")).toBe(true);
    expect(isExpectedDay(db, emp, "2026-09-06")).toBe(false);
  });

  it("excludes a public holiday", () => {
    const db = base({ holidays: [{ date: "2026-09-03" }] });
    expect(isExpectedDay(db, emp, "2026-09-03")).toBe(false);
  });

  it("honours a personal day off from a custom week schedule", () => {
    const wed = { ...emp, scheduleMode: "custom", weekSchedule: { Wed: { off: true } } };
    const db = base();
    expect(isExpectedDay(db, wed, "2026-09-02")).toBe(false);  // Wednesday
    expect(isExpectedDay(db, wed, "2026-09-03")).toBe(true);
  });
});

describe("absenceHistory", () => {
  const today = new Date(2026, 8, 4);   // Fri 4 Sep 2026

  it("counts clocked-in days as present and the rest as absent", () => {
    const db = base({ attendance: att(["2026-09-01", "2026-09-02"]) });
    const h = absenceHistory(db, emp, "2026-09-01", "2026-09-30", today);
    expect(h.expected).toBe(4);              // Tue–Fri
    expect(h.present).toBe(2);
    expect(h.absent).toEqual(["2026-09-03", "2026-09-04"]);
  });

  it("never looks past today — future working days are not absences", () => {
    const h = absenceHistory(base(), emp, "2026-09-01", "2026-09-30", today);
    expect(h.expected).toBe(4);
    expect(h.absent).toHaveLength(4);
    expect(h.absent.every((d) => d <= "2026-09-04")).toBe(true);
  });

  it("separates approved leave from unexplained absence", () => {
    const db = base({ leave: [{ id: "l1", empId: "e1", status: "approved", type: "Annual", from: "2026-09-02", to: "2026-09-03" }] });
    const h = absenceHistory(db, emp, "2026-09-01", "2026-09-30", today);
    expect(h.leave.map((x) => x.date)).toEqual(["2026-09-02", "2026-09-03"]);
    expect(h.absent).toEqual(["2026-09-01", "2026-09-04"]);
  });

  it("ignores leave that was never approved", () => {
    const db = base({ leave: [{ id: "l1", empId: "e1", status: "pending_hr", type: "Annual", from: "2026-09-02", to: "2026-09-02" }] });
    const h = absenceHistory(db, emp, "2026-09-01", "2026-09-30", today);
    expect(h.leave).toHaveLength(0);
    expect(h.absent).toContain("2026-09-02");
  });

  it("credits an approved excursion as a day worked", () => {
    const db = base({ permissions: [{ empId: "e1", kind: "excursion", status: "approved", date: "2026-09-02" }] });
    const h = absenceHistory(db, emp, "2026-09-01", "2026-09-30", today);
    expect(h.present).toBe(1);
    expect(h.absent).not.toContain("2026-09-02");
  });

  it("does not mark someone absent before they joined", () => {
    const late = { ...emp, joined: "2026-09-03" };
    const h = absenceHistory(base(), late, "2026-09-01", "2026-09-30", today);
    expect(h.expected).toBe(2);
    expect(h.absent).toEqual(["2026-09-03", "2026-09-04"]);
  });

  it("counts a clocked-in day as present even if leave was also approved", () => {
    const db = base({
      attendance: att(["2026-09-02"]),
      leave: [{ id: "l1", empId: "e1", status: "approved", type: "Sick", from: "2026-09-02", to: "2026-09-02" }],
    });
    const h = absenceHistory(db, emp, "2026-09-01", "2026-09-30", today);
    expect(h.present).toBe(1);
    expect(h.leave).toHaveLength(0);
  });

  it("returns an empty record for no employee", () => {
    const h = absenceHistory(base(), null, "2026-09-01", "2026-09-30", today);
    expect(h.expected).toBe(0);
    expect(h.absent).toEqual([]);
  });
});

describe("leaveHistoryFor", () => {
  it("returns that person's requests newest first, whatever the status", () => {
    const db = base({ leave: [
      { id: "a", empId: "e1", from: "2026-01-05", status: "approved" },
      { id: "b", empId: "e2", from: "2026-08-01", status: "approved" },
      { id: "c", empId: "e1", from: "2026-07-01", status: "declined" },
    ] });
    expect(leaveHistoryFor(db, "e1").map((l) => l.id)).toEqual(["c", "a"]);
  });
});

describe("leaveTakenByType", () => {
  const db = base({ leave: [
    { empId: "e1", status: "approved", type: "Annual", from: "2026-03-02", days: 4 },
    { empId: "e1", status: "approved", type: "Annual", from: "2026-07-01", days: 3 },
    { empId: "e1", status: "approved", type: "Sick",   from: "2026-05-11", days: 2 },
    { empId: "e1", status: "declined", type: "Annual", from: "2026-08-01", days: 5 },
    { empId: "e1", status: "approved", type: "Annual", from: "2025-04-01", days: 9 },
    { empId: "e2", status: "approved", type: "Annual", from: "2026-02-02", days: 6 },
  ] });

  it("totals approved days per type for that year only", () => {
    expect(leaveTakenByType(db, "e1", 2026)).toEqual({ Annual: 7, Sick: 2 });
  });

  it("ignores declined and pending requests", () => {
    expect(leaveTakenByType(db, "e1", 2026).Annual).toBe(7);   // not 12
  });

  it("keeps each person separate", () => {
    expect(leaveTakenByType(db, "e2", 2026)).toEqual({ Annual: 6 });
  });

  it("returns an empty object when there is nothing", () => {
    expect(leaveTakenByType(db, "nobody", 2026)).toEqual({});
  });
});
