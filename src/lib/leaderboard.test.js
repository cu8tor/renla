import { describe, it, expect } from "vitest";
import { computeLeaderboard, monthKeyOf, MIN_DAYS } from "./leaderboard.js";

const work = { dayStart: "09:00", dayEnd: "17:00", graceMins: 0, shifts: [{ id: "night", name: "Night shift", start: "20:00", end: "04:00" }] };
const employees = [
  { id: "e1", name: "Ada", status: "Active" },
  { id: "e2", name: "Bola", status: "Active" },
  { id: "e3", name: "Chidi", status: "Active" },
  { id: "e4", name: "Dupe", status: "Exited" },
];

const att = (empId, date, clockIn) => ({ empId, date, clockIn });

describe("monthKeyOf", () => {
  it("takes the YYYY-MM prefix off an ISO date", () => {
    expect(monthKeyOf("2026-08-19")).toBe("2026-08");
    expect(monthKeyOf("")).toBe("");
  });
});

describe("computeLeaderboard", () => {
  it("ranks by average minutes early, most-early first", () => {
    const attendance = [
      att("e1", "2026-08-01", "08:50"), att("e1", "2026-08-02", "08:45"), att("e1", "2026-08-03", "08:55"), // ~7.5 min early avg
      att("e2", "2026-08-01", "08:30"), att("e2", "2026-08-02", "08:35"), att("e2", "2026-08-03", "08:25"), // ~28 min early avg
    ];
    const ranked = computeLeaderboard({ employees, attendance, work, branches: [], monthKey: "2026-08" });
    expect(ranked.map((r) => r.empId)).toEqual(["e2", "e1"]);
    expect(ranked[0].rank).toBe(1);
    expect(ranked[1].rank).toBe(2);
  });

  it("excludes anyone under MIN_DAYS tracked days this month", () => {
    const attendance = Array.from({ length: MIN_DAYS - 1 }, (_, i) => att("e1", `2026-08-0${i + 1}`, "08:50"));
    const ranked = computeLeaderboard({ employees, attendance, work, branches: [], monthKey: "2026-08" });
    expect(ranked.find((r) => r.empId === "e1")).toBeUndefined();
  });

  it("excludes non-Active employees even with plenty of data", () => {
    const attendance = [att("e4", "2026-08-01", "08:00"), att("e4", "2026-08-02", "08:00"), att("e4", "2026-08-03", "08:00")];
    const ranked = computeLeaderboard({ employees, attendance, work, branches: [], monthKey: "2026-08" });
    expect(ranked.length).toBe(0);
  });

  it("only counts rows inside the requested month", () => {
    const attendance = [
      att("e1", "2026-07-30", "08:00"), att("e1", "2026-07-31", "08:00"), // last month — shouldn't count
      att("e1", "2026-08-01", "08:50"), att("e1", "2026-08-02", "08:50"), att("e1", "2026-08-03", "08:50"),
    ];
    const ranked = computeLeaderboard({ employees, attendance, work, branches: [], monthKey: "2026-08" });
    expect(ranked[0].days).toBe(3);
  });

  it("judges a night-shift worker against their own shift start, not the flat company time", () => {
    const nightEmp = [{ id: "e1", name: "Ada", status: "Active", shiftId: "night" }];
    // Shift starts 20:00 — clocking in at 19:55 is 5 minutes early, even
    // though 19:55 would look "very late" against the company's 09:00 default.
    const attendance = [att("e1", "2026-08-01", "19:55"), att("e1", "2026-08-02", "19:50"), att("e1", "2026-08-03", "19:58")];
    const ranked = computeLeaderboard({ employees: nightEmp, attendance, work, branches: [], monthKey: "2026-08" });
    expect(ranked[0].avgEarly).toBeGreaterThan(0);
  });

  it("computes a streak of consecutive on-time-or-early days, ending as soon as a late day is hit", () => {
    const attendance = [
      att("e1", "2026-08-01", "09:10"), // late — breaks any streak before it
      att("e1", "2026-08-02", "08:55"), // early
      att("e1", "2026-08-03", "08:50"), // early
      att("e1", "2026-08-04", "09:00"), // on time
    ];
    const ranked = computeLeaderboard({ employees, attendance, work, branches: [], monthKey: "2026-08" });
    expect(ranked[0].streak).toBe(3);
  });

  it("breaks ties on avgEarly by more days tracked, then by name", () => {
    const attendance = [
      att("e1", "2026-08-01", "08:50"), att("e1", "2026-08-02", "08:50"), att("e1", "2026-08-03", "08:50"),
      att("e2", "2026-08-01", "08:50"), att("e2", "2026-08-02", "08:50"), att("e2", "2026-08-03", "08:50"), att("e2", "2026-08-04", "08:50"),
    ];
    const ranked = computeLeaderboard({ employees, attendance, work, branches: [], monthKey: "2026-08" });
    // same avgEarly (10 min) for both — e2 has more days, so ranks first
    expect(ranked[0].empId).toBe("e2");
    expect(ranked[1].empId).toBe("e1");
  });
});
