/* =====================================================================
   Billing status — the sentence, not the numbers.

   The billing pages used to show four equal tiles (balance, months
   covered, plan, paid through) and leave the reader to work out whether
   they were fine. ₦0 is both "perfectly up to date" and "about to be
   cut off" depending on what's coming, and a tile can't tell you which.

   So the conclusion is computed once, here, and both the customer page
   and Renla's own admin view read it. If they ever disagreed about
   whether somebody is behind, that would be the worse bug.

   The verdict lives here; the wording that needs money in it lives in
   the pages, which have a formatter and know who they're talking to.
   ===================================================================== */

/* States, in the order trouble arrives:

     free    nothing to pay
     behind  the balance is negative — they owe money now
     due     exactly nothing left, with a charge coming
     thin    something left, but under one month
     ahead   covered for at least a month
*/
export function billingStatus({ balance, monthly }) {
  const b = Math.round((Number(balance) || 0) * 100) / 100;
  const m = Math.round((Number(monthly) || 0) * 100) / 100;

  if (m <= 0) {
    return {
      state: "free", tone: "muted", owed: 0, monthsAhead: null,
      short: "Free plan",
      headline: "Nothing to pay",
    };
  }

  if (b < 0) {
    const owed = Math.abs(b);
    // Months is how you think about chasing it; the amount is what gets
    // transferred. The short form leads with the amount because that's
    // the number somebody types into a banking app.
    const months = Math.ceil(owed / m);
    return {
      state: "behind", tone: "danger", owed, monthsAhead: 0,
      short: `Behind by ${months} ${months === 1 ? "month" : "months"}`,
      headline: "Your account is behind",
    };
  }

  if (b === 0) {
    return {
      state: "due", tone: "warn", owed: 0, monthsAhead: 0,
      short: "Up to date",
      // Honest in both directions: nothing owed, nothing left either.
      // "You're up to date" alone read as reassurance next to an amber
      // warning, which is the sort of mixed signal people ignore.
      headline: "Up to date, but empty",
    };
  }

  if (b < m) {
    return {
      state: "thin", tone: "warn", owed: 0, monthsAhead: 0,
      short: "Under a month",
      headline: "Running low",
    };
  }

  const monthsAhead = Math.floor(b / m);
  return {
    state: "ahead", tone: "ok", owed: 0, monthsAhead,
    short: `${monthsAhead} ${monthsAhead === 1 ? "month" : "months"} ahead`,
    headline: "You're covered",
  };
}

/* A running balance, oldest first, returned newest-first to match the
   order a statement is read in.

   Without this a statement can't be reconciled: you can see a charge and
   a payment but not what either one left behind. */
export function withRunningBalance(entries) {
  const list = [...(entries || [])].sort((a, b) => {
    const t = new Date(a.createdAt) - new Date(b.createdAt);
    return t !== 0 ? t : String(a.id).localeCompare(String(b.id));  // stable within a day
  });

  let running = 0;
  const walked = list.map((e) => {
    running = Math.round((running + (Number(e.amount) || 0)) * 100) / 100;
    return { ...e, balanceAfter: running };
  });

  return walked.reverse();
}

/* Ledger descriptions are written for the ledger: "Subscription —
   2026-11" is right in a database row and wrong on a customer's screen.
   Rewriting at read time rather than at write time means the rows
   already stored get fixed too. */
const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function prettyWhat(description) {
  const s = String(description || "").trim();
  if (!s) return "—";

  const m = s.match(/^(.*?)\s*[—–-]\s*(\d{4})-(\d{2})$/);
  if (m) {
    const month = MONTHS[Number(m[3]) - 1];
    if (month) return `${m[1]} · ${month} ${m[2]}`;
  }
  return s;
}

/* When the wallet runs out, at the rate they're being charged today.

   This replaces companies.paid_through as the thing a customer is shown.
   A stored date is a promise the wallet can't keep: pay for a year at
   three staff, hire eight more, and the date still says twelve months
   while the money covers six. Two sources of truth, and the date is the
   one that's wrong.

   Derived, it corrects itself. Add staff and the date moves closer, which
   is both true and the thing they need to know.

   Returns null when there is nothing to work out: no charge to consume
   the credit, or no credit left to consume.

   Approximate on purpose — month lengths differ and headcount will change
   again, so it is always shown with an "about". */
export function coveredUntil({ balance, monthly, from = new Date() }) {
  const b = Number(balance) || 0;
  const m = Number(monthly) || 0;
  if (m <= 0 || b <= 0) return null;

  const months = b / m;
  const whole = Math.floor(months);
  const out = new Date(from.getTime());

  // Pin to the 1st before adding months, so adding one month to the 31st
  // can't skip a month entirely, then put the day back.
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + whole);
  out.setDate(Math.min(day, daysInMonth(out.getFullYear(), out.getMonth())));

  out.setDate(out.getDate() + Math.round((months - whole) * 30));
  return out;
}

function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}
