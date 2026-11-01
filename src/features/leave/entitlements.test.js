import { describe, it, expect } from "vitest";
import {
  DEFAULT_LEAVE_POLICY, policyOf, takenInYear, entitlementFor,
  carriedInto, leaveBalances, leaveLeft,
} from "./entitlements.js";

const emp = { id: "e1", joined: "2024-01-15" };
const db = (over = {}) => ({ leave: [], leavePolicy: {}, ...over });
const approved = (type, from, days, empId = "e1") => ({ empId, status: "approved", type, from, days });

describe("policyOf", () => {
  it("defaults to no rollover — a company has to ask for it", () => {
    expect(DEFAULT_LEAVE_POLICY.rollover).toBe(false);
    expect(policyOf(db()).rollover).toBe(false);
  });

  it("fills in anything a company hasn't set", () => {
    const p = policyOf(db({ leavePolicy: { annual: 25 } }));
    expect(p.annual).toBe(25);
    expect(p.sick).toBe(DEFAULT_LEAVE_POLICY.sick);
    expect(p.rolloverCap).toBe(DEFAULT_LEAVE_POLICY.rolloverCap);
  });
});

describe("takenInYear", () => {
  const leave = [
    approved("Annual", "2026-03-02", 4),
    approved("Annual", "2026-07-01", 3),
    approved("Sick", "2026-05-11", 2),
    approved("Annual", "2025-04-01", 9),
    { empId: "e1", status: "declined", type: "Annual", from: "2026-08-01", days: 5 },
    { empId: "e1", status: "pending_hr", type: "Annual", from: "2026-09-01", days: 5 },
    approved("Annual", "2026-02-02", 6, "e2"),
  ];

  it("counts only approved days, for that person, type and year", () => {
    expect(takenInYear(leave, "e1", "Annual", 2026)).toBe(7);
    expect(takenInYear(leave, "e1", "Sick", 2026)).toBe(2);
    expect(takenInYear(leave, "e1", "Annual", 2025)).toBe(9);
    expect(takenInYear(leave, "e2", "Annual", 2026)).toBe(6);
  });

  it("ignores declined and pending requests", () => {
    expect(takenInYear(leave, "e1", "Annual", 2026)).not.toBe(17);
  });
});

describe("entitlementFor", () => {
  const policy = policyOf(db());

  it("uses the company figure", () => {
    expect(entitlementFor(emp, policy, "annual", 2026)).toBe(20);
    expect(entitlementFor(emp, policy, "comp", 2026)).toBe(5);
  });

  it("lets a per-employee override win", () => {
    const senior = { ...emp, entitlement: { annual: 30 } };
    expect(entitlementFor(senior, policy, "annual", 2026)).toBe(30);
    // and leaves the types it doesn't mention alone
    expect(entitlementFor(senior, policy, "sick", 2026)).toBe(10);
  });

  it("pro-rates the year someone joined, counting the joining month", () => {
    const octJoiner = { id: "e2", joined: "2026-10-20" };
    expect(entitlementFor(octJoiner, policy, "annual", 2026)).toBe(5);   // 20 × 3/12
    const janJoiner = { id: "e3", joined: "2026-01-02" };
    expect(entitlementFor(janJoiner, policy, "annual", 2026)).toBe(20);
  });

  it("gives a full allowance in every year after the one they joined", () => {
    const octJoiner = { id: "e2", joined: "2026-10-20" };
    expect(entitlementFor(octJoiner, policy, "annual", 2027)).toBe(20);
  });

  it("doesn't pro-rate when the company has turned that off", () => {
    const p = policyOf(db({ leavePolicy: { proRateFirstYear: false } }));
    const octJoiner = { id: "e2", joined: "2026-10-20" };
    expect(entitlementFor(octJoiner, p, "annual", 2026)).toBe(20);
  });
});

describe("carriedInto", () => {
  const lastYear = [approved("Annual", "2025-03-01", 8)];   // 20 − 8 = 12 unused

  it("carries nothing by default", () => {
    const p = policyOf(db());
    expect(carriedInto(emp, p, "annual", 2026, lastYear)).toBe(0);
  });

  it("carries unused days, capped, once rollover is on", () => {
    const p = policyOf(db({ leavePolicy: { rollover: true } }));
    expect(carriedInto(emp, p, "annual", 2026, lastYear)).toBe(5);    // capped from 12
  });

  it("carries only what's actually unused when that's under the cap", () => {
    const p = policyOf(db({ leavePolicy: { rollover: true } }));
    const heavyUser = [approved("Annual", "2025-03-01", 18)];          // 2 unused
    expect(carriedInto(emp, p, "annual", 2026, heavyUser)).toBe(2);
  });

  it("never carries a negative when someone overspent last year", () => {
    const p = policyOf(db({ leavePolicy: { rollover: true } }));
    const overspent = [approved("Annual", "2025-03-01", 26)];
    expect(carriedInto(emp, p, "annual", 2026, overspent)).toBe(0);
  });

  it("carries nothing into the year someone joined", () => {
    const p = policyOf(db({ leavePolicy: { rollover: true } }));
    const newJoiner = { id: "e9", joined: "2026-02-01" };
    expect(carriedInto(newJoiner, p, "annual", 2026, [])).toBe(0);
  });

  it("respects a company's own cap", () => {
    const p = policyOf(db({ leavePolicy: { rollover: true, rolloverCap: 10 } }));
    expect(carriedInto(emp, p, "annual", 2026, lastYear)).toBe(10);
  });
});

describe("leaveBalances", () => {
  it("left = entitlement + carried − taken", () => {
    const d = db({ leave: [approved("Annual", "2026-03-01", 6)] });
    const b = leaveBalances(emp, d, 2026);
    expect(b.annual).toEqual({ entitlement: 20, carried: 0, taken: 6, granted: 20, left: 14 });
  });

  it("includes carried days in the granted total when rollover is on", () => {
    const d = db({
      leavePolicy: { rollover: true },
      leave: [approved("Annual", "2025-01-01", 15), approved("Annual", "2026-03-01", 6)],
    });
    const b = leaveBalances(emp, d, 2026);
    expect(b.annual.carried).toBe(5);        // 20 − 15 unused last year, capped at 5
    expect(b.annual.granted).toBe(25);       // 20 entitlement + 5 carried
    expect(b.annual.left).toBe(19);          // 25 − 6 taken this year
  });

  it("carries nothing into the same figures when rollover is off", () => {
    const d = db({ leave: [approved("Annual", "2025-01-01", 15), approved("Annual", "2026-03-01", 6)] });
    const b = leaveBalances(emp, d, 2026);
    expect(b.annual.carried).toBe(0);
    expect(b.annual.granted).toBe(20);
    expect(b.annual.left).toBe(14);
  });

  it("never reports a negative balance", () => {
    const d = db({ leave: [approved("Annual", "2026-03-01", 26)] });
    expect(leaveBalances(emp, d, 2026).annual.left).toBe(0);
  });

  it("self-corrects when a request is declined after approval", () => {
    const beforeD = db({ leave: [approved("Annual", "2026-03-01", 6)] });
    expect(leaveBalances(emp, beforeD, 2026).annual.left).toBe(14);

    const afterD = db({ leave: [{ ...approved("Annual", "2026-03-01", 6), status: "declined" }] });
    expect(leaveBalances(emp, afterD, 2026).annual.left).toBe(20);
  });

  it("resets taken at the turn of the year", () => {
    const d = db({ leave: [approved("Annual", "2026-03-01", 20)] });
    expect(leaveBalances(emp, d, 2026).annual.left).toBe(0);
    expect(leaveBalances(emp, d, 2027).annual.left).toBe(20);
  });

  it("handles an employee with no leave at all", () => {
    const b = leaveBalances(emp, db(), 2026);
    expect(b.annual.left).toBe(20);
    expect(b.sick.left).toBe(10);
    expect(b.comp.left).toBe(5);
  });
});

describe("leaveLeft", () => {
  it("gives the three remaining figures in the old balance shape", () => {
    const d = db({ leave: [approved("Annual", "2026-03-01", 6), approved("Sick", "2026-04-01", 2)] });
    expect(leaveLeft(emp, d, 2026)).toEqual({ annual: 14, sick: 8, comp: 5 });
  });
});
