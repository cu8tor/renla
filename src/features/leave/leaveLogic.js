/* =====================================================================
   leaveLogic.js — the pure decision rules behind Renla's leave approval
   chain, extracted out of App.jsx's decideLeave/applyLeave closures so
   they can be tested in isolation. App.jsx still owns the actual state
   update (update()/toast()) — this module only decides "what should the
   new status be", which is exactly the behaviour the blueprint calls out
   as tested: a two-stage manager-then-HR chain where HR has the final say
   at either stage.
   ===================================================================== */

/* NOTE — balances used to live here. `shouldDecrementBalance` and
   `decrementLeaveBalance` kept a running counter on the employee record,
   decremented when leave was approved. Both are gone: a balance is now
   derived in features/leave/entitlements.js as

       entitlement + carried over − approved this year

   which can't drift, gives days back when a request is declined or
   deleted, and makes "14 of 20" possible to show. Nothing writes to
   employees.balances any more. */

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

/* Validation for a new leave request's date range. `existing` (optional —
   omit it and this behaves exactly as before) is this employee's own other
   leave requests; if the new range overlaps one that's still pending or
   already approved, this rejects it instead of silently letting both
   through. Two overlapping approved requests used to double-count that
   employee's paid-leave days in payroll (each counted in full, so a
   genuinely 5-day overlap could inflate paidLeave by the full second
   request's days too), quietly reducing their absence deduction with
   nothing in the UI ever flagging the collision. */
function validateLeaveDates(from, to, parseD, existing = []) {
  if (!from || !to) return { ok: false, error: "Add a start and end date" };
  if (parseD(to) < parseD(from)) return { ok: false, error: "The end date is before the start date" };
  const overlap = (existing || []).find((l) =>
    l.status !== "declined" && parseD(from) <= parseD(l.to) && parseD(l.from) <= parseD(to)
  );
  if (overlap) {
    return { ok: false, error: `Overlaps your ${overlap.status === "approved" ? "approved" : "pending"} ${overlap.type} request (${overlap.from} to ${overlap.to})` };
  }
  return { ok: true };
}

export { nextLeaveStatus, validateLeaveDates };
