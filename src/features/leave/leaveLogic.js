/* =====================================================================
   leaveLogic.js — the pure decision rules behind Renla's leave approval
   chain, extracted out of App.jsx's decideLeave/applyLeave closures so
   they can be tested in isolation. App.jsx still owns the actual state
   update (update()/toast()) — this module only decides "what should the
   new status be" and "how should the balance change," which is exactly
   the behaviour the blueprint calls out as tested: a two-stage
   manager-then-HR chain where HR has the final say at either stage.
   ===================================================================== */

const BAL_KEYS = { Annual: "annual", Sick: "sick", Compassionate: "comp" };

/* Given a leave request's current status, whether this action approves or
   declines it, and whether the acting user is HR: decide the new status.
   A manager's approval passes the request up to HR rather than closing it
   out; HR can act at either stage and their decision is final. */
function nextLeaveStatus(currentStatus, approve, isHR) {
  if (!approve) return "declined";
  if (currentStatus === "pending_manager" && !isHR) return "pending_hr";
  if (currentStatus === "pending_hr" || (currentStatus === "pending_manager" && isHR)) return "approved";
  return currentStatus;
}

/* True only on the specific transition that should decrement a balance —
   i.e. the request is becoming "approved" on this action, not already
   approved before it. Prevents double-decrementing if called again. */
function shouldDecrementBalance(currentStatus, nextStatus) {
  return nextStatus === "approved" && currentStatus !== "approved";
}

/* Deduct a leave request's days from the matching balance bucket, floored
   at zero. Leave types without a tracked balance (no entry in BAL_KEYS)
   leave the employee record untouched. */
function decrementLeaveBalance(employee, leaveType, days) {
  const key = BAL_KEYS[leaveType];
  if (!key) return employee;
  return {
    ...employee,
    bal: { ...employee.bal, [key]: Math.max(0, (employee.bal?.[key] ?? 0) - days) },
  };
}

/* Validation for a new leave request's date range. */
function validateLeaveDates(from, to, parseD) {
  if (!from || !to) return { ok: false, error: "Add a start and end date" };
  if (parseD(to) < parseD(from)) return { ok: false, error: "The end date is before the start date" };
  return { ok: true };
}

export { BAL_KEYS, nextLeaveStatus, shouldDecrementBalance, decrementLeaveBalance, validateLeaveDates };
