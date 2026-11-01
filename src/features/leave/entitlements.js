/* =====================================================================
   entitlements.js — how many leave days someone actually has.

   Until now Renla stored only what was LEFT, as a counter on the
   employee record that got decremented when leave was approved. That
   made "9 of 20 days" impossible to show honestly — there was no 20
   anywhere — and the counter could drift from reality: a request
   declined after approval, or deleted, never gave the days back.

   Everything here is derived instead, from three things that are all
   independently true:

       left = entitlement + carried in from last year − taken this year

   Nothing is stored that can go stale. Delete a leave request and the
   days come back on their own; change someone's entitlement and the
   arithmetic follows. The old `balances` column is left alone and is
   no longer read — see catch-up-migration-13.sql, which uses it once
   to reconstruct everyone's entitlement so that nobody's visible
   balance changes on the day this ships.

   WHERE THE NUMBERS COME FROM

   Entitlement is the company default (Settings → Leave entitlement),
   optionally overridden per employee for someone on different terms.
   The same company → employee shape the working-hours settings already
   use.

   Carry-over is OFF by default: a year's unused days expire at the end
   of it unless the company turns rollover on, which is the safer
   default to ship and the common arrangement. When it is on, carried
   days are capped, and — deliberately — carry only ONE year. Days
   brought into 2027 from 2026 cannot be carried on again into 2028.
   That's the ordinary "use it within twelve months" rule, and it also
   stops an unbounded chain of recursion over an employee's whole
   history.

   First-year pro-rating is on by default: someone who joins in October
   gets three months' worth, not a full year's. Turning it off gives
   every joiner the full allowance whatever month they start.
   ===================================================================== */

/* Leave types that draw down a balance, and the key each one uses.
   A type absent from here — Maternity, Study, Unpaid — is granted
   without being counted against an allowance, which is why it has no
   entitlement and never shows a "left" figure. */
const BALANCE_TYPES = [
  { key: "annual", type: "Annual", label: "Annual" },
  { key: "sick", type: "Sick", label: "Sick" },
  { key: "comp", type: "Compassionate", label: "Compassionate" },
];

/* What a company starts with. The three day figures match the old
   hardcoded blankBalances() so nothing shifts for anyone already
   using Renla. */
const DEFAULT_LEAVE_POLICY = {
  annual: 20,
  sick: 10,
  comp: 5,
  rollover: false,      // unused days expire at year end
  rolloverCap: 5,       // and when they don't, at most this many carry
  proRateFirstYear: true,
};

/* NB: db.leave is the leave REQUESTS array. The policy lives separately
   under db.leavePolicy, from company_settings.leave_policy. */
const policyOf = (db) => ({ ...DEFAULT_LEAVE_POLICY, ...(db?.leavePolicy || {}) });

const yearOf = (iso) => Number(String(iso || "").slice(0, 4)) || null;
const monthOf = (iso) => Number(String(iso || "").slice(5, 7)) || null;
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* Days of one type approved in one calendar year, by the date the leave
   STARTS. A request spanning New Year counts wholly in the year it
   began — crude, but it matches how `taken` already reads everywhere
   else in the app, and splitting it would make the two disagree. */
function takenInYear(leave, empId, type, year) {
  return (leave || [])
    .filter((l) => l.empId === empId && l.status === "approved" && l.type === type && yearOf(l.from) === year)
    .reduce((t, l) => t + num(l.days), 0);
}

/* The allowance granted for one year, before anything is taken.

   Pro-rating counts whole months INCLUDING the one they joined in, so
   somebody starting on 20 October still gets October — the alternative
   punishes a late-in-the-month start date for nothing. */
function entitlementFor(emp, policy, key, year) {
  const base = num(emp?.entitlement?.[key] ?? policy[key]);
  if (!policy.proRateFirstYear || !emp?.joined) return base;

  const joinedYear = yearOf(emp.joined);
  if (joinedYear !== year) return base;

  const months = 13 - (monthOf(emp.joined) || 1);     // joined in Jan → 12, Oct → 3
  return Math.round((base * months) / 12);
}

/* Unused days brought in from last year. Zero unless the company has
   turned rollover on, and never more than the cap.

   Last year's own carry-in is deliberately treated as zero rather than
   recursing: carried days don't carry twice. */
function carriedInto(emp, policy, key, year, leave) {
  if (!policy.rollover) return 0;
  if (!emp?.joined || yearOf(emp.joined) >= year) return 0;   // no previous year to carry from

  const prev = year - 1;
  const granted = entitlementFor(emp, policy, key, prev);
  const type = BALANCE_TYPES.find((b) => b.key === key)?.type;
  const used = takenInYear(leave, emp.id, type, prev);
  const unused = Math.max(0, granted - used);
  return Math.min(num(policy.rolloverCap), unused);
}

/* The full picture for one employee, one year — every figure the UI
   needs, each one derived rather than stored:

     { annual: { entitlement, carried, taken, left, granted }, sick: …, comp: … }

   `granted` is entitlement + carried, i.e. the denominator in
   "9 of 23 days". `left` is floored at zero: approving more leave than
   someone has is HR's call to make, and showing −2 helps nobody. */
function leaveBalances(emp, db, year = new Date().getFullYear()) {
  const policy = policyOf(db);
  const leave = db?.leave || [];
  const out = {};

  BALANCE_TYPES.forEach(({ key, type }) => {
    const entitlement = entitlementFor(emp, policy, key, year);
    const carried = carriedInto(emp, policy, key, year, leave);
    const taken = takenInYear(leave, emp?.id, type, year);
    const granted = entitlement + carried;
    out[key] = { entitlement, carried, taken, granted, left: Math.max(0, granted - taken) };
  });

  return out;
}

/* Just the remaining days, in the shape the old `emp.bal` had, so the
   many places that only want a number can swap over without each one
   learning the whole model. */
function leaveLeft(emp, db, year) {
  const b = leaveBalances(emp, db, year);
  return { annual: b.annual.left, sick: b.sick.left, comp: b.comp.left };
}

export {
  BALANCE_TYPES,
  DEFAULT_LEAVE_POLICY,
  policyOf,
  takenInYear,
  entitlementFor,
  carriedInto,
  leaveBalances,
  leaveLeft,
};
