/* =====================================================================
   leaveLogic.test.js

   Locks in the two-stage manager-then-HR approval chain exactly as
   App.jsx's original decideLeave/applyLeave implemented it:
     - a manager approving a "pending_manager" request only moves it to
       "pending_hr" — it does not close it out
     - HR can act at either stage ("pending_manager" or "pending_hr") and
       their decision is final
     - a balance is decremented only on the specific transition into
       "approved", never twice
   ===================================================================== */

import { describe, it, expect } from "vitest";
import {
  BAL_KEYS,
  nextLeaveStatus,
  shouldDecrementBalance,
  decrementLeaveBalance,
  validateLeaveDates,
} from "./leaveLogic.js";

describe("nextLeaveStatus — two-stage manager-then-HR chain", () => {
  it("a manager approving a pending_manager request sends it to pending_hr, not approved", () => {
    expect(nextLeaveStatus("pending_manager", true, false)).toBe("pending_hr");
  });

  it("HR approving a pending_manager request directly approves it (HR can act at either stage)", () => {
    expect(nextLeaveStatus("pending_manager", true, true)).toBe("approved");
  });

  it("HR approving a pending_hr request approves it", () => {
    expect(nextLeaveStatus("pending_hr", true, true)).toBe("approved");
  });

  it("matches the original code's fallthrough: a pending_hr request is approved on any approve action, regardless of isHR", () => {
    // This looks surprising but it's a faithful port of App.jsx's original
    // decideLeave: the "pending_hr" branch doesn't gate on isHR at all — by
    // the time a request reaches pending_hr, any further "approve" action
    // closes it out. Preserved here deliberately (zero behaviour change),
    // not asserted as correct product behaviour.
    expect(nextLeaveStatus("pending_hr", true, false)).toBe("approved");
  });

  it("declining at any stage, by anyone, always results in declined", () => {
    expect(nextLeaveStatus("pending_manager", false, false)).toBe("declined");
    expect(nextLeaveStatus("pending_manager", false, true)).toBe("declined");
    expect(nextLeaveStatus("pending_hr", false, false)).toBe("declined");
    expect(nextLeaveStatus("pending_hr", false, true)).toBe("declined");
  });
});

describe("shouldDecrementBalance", () => {
  it("is true only on the transition into approved", () => {
    expect(shouldDecrementBalance("pending_hr", "approved")).toBe(true);
    expect(shouldDecrementBalance("pending_manager", "approved")).toBe(true);
  });

  it("is false if already approved (prevents double-decrementing)", () => {
    expect(shouldDecrementBalance("approved", "approved")).toBe(false);
  });

  it("is false for any non-approved outcome", () => {
    expect(shouldDecrementBalance("pending_manager", "pending_hr")).toBe(false);
    expect(shouldDecrementBalance("pending_manager", "declined")).toBe(false);
  });
});

describe("decrementLeaveBalance", () => {
  const employee = { id: "e1", bal: { annual: 10, sick: 5, comp: 2 } };

  it("deducts days from the matching balance bucket for a tracked leave type", () => {
    const out = decrementLeaveBalance(employee, "Annual", 3);
    expect(out.bal.annual).toBe(7);
    expect(out.bal.sick).toBe(5); // untouched
  });

  it("maps each of the three tracked leave types to the right bucket", () => {
    expect(BAL_KEYS).toEqual({ Annual: "annual", Sick: "sick", Compassionate: "comp" });
    expect(decrementLeaveBalance(employee, "Sick", 2).bal.sick).toBe(3);
    expect(decrementLeaveBalance(employee, "Compassionate", 1).bal.comp).toBe(1);
  });

  it("floors at zero rather than going negative", () => {
    const out = decrementLeaveBalance(employee, "Sick", 999);
    expect(out.bal.sick).toBe(0);
  });

  it("leaves the employee record untouched for an untracked leave type", () => {
    const out = decrementLeaveBalance(employee, "Unpaid", 5);
    expect(out).toBe(employee);
  });
});

describe("validateLeaveDates", () => {
  const parseD = (s) => new Date(s);

  it("rejects a request missing a start or end date", () => {
    expect(validateLeaveDates("", "2026-08-20", parseD)).toEqual({ ok: false, error: "Add a start and end date" });
    expect(validateLeaveDates("2026-08-20", "", parseD)).toEqual({ ok: false, error: "Add a start and end date" });
  });

  it("rejects an end date before the start date", () => {
    expect(validateLeaveDates("2026-08-20", "2026-08-15", parseD)).toEqual({
      ok: false,
      error: "The end date is before the start date",
    });
  });

  it("accepts a valid same-day or forward-dated range", () => {
    expect(validateLeaveDates("2026-08-15", "2026-08-15", parseD)).toEqual({ ok: true });
    expect(validateLeaveDates("2026-08-15", "2026-08-20", parseD)).toEqual({ ok: true });
  });
});
