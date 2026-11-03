import { describe, it, expect } from "vitest";
import { billingStatus, withRunningBalance, prettyWhat, coveredUntil, seatPosition } from "./status.js";

describe("billingStatus", () => {
  it("says there is nothing to pay on a plan with no charge", () => {
    const s = billingStatus({ balance: 0, monthly: 0 });
    expect(s.state).toBe("free");
    expect(s.short).toBe("Free plan");
  });

  it("treats a free plan as free even with money sitting in the wallet", () => {
    expect(billingStatus({ balance: 20000, monthly: 0 }).state).toBe("free");
  });

  /* The case that started this: ₦0 reads as fine but isn't, because a
     charge is coming. It must not look the same as being covered. */
  it("separates an empty wallet from a covered one", () => {
    const empty = billingStatus({ balance: 0, monthly: 5000 });
    const covered = billingStatus({ balance: 5000, monthly: 5000 });
    expect(empty.state).toBe("due");
    expect(covered.state).toBe("ahead");
    expect(empty.tone).not.toBe(covered.tone);
  });

  /* A headline that reassures while the colour warns is a mixed signal,
     and a mixed signal gets ignored. */
  it("does not reassure in the headline while warning in the tone", () => {
    const empty = billingStatus({ balance: 0, monthly: 5000 });
    expect(empty.tone).toBe("warn");
    expect(empty.headline).toMatch(/empty/i);
  });

  it("counts whole months ahead and rounds down", () => {
    expect(billingStatus({ balance: 5000, monthly: 5000 }).monthsAhead).toBe(1);
    expect(billingStatus({ balance: 12000, monthly: 5000 }).monthsAhead).toBe(2);
    expect(billingStatus({ balance: 14999, monthly: 5000 }).monthsAhead).toBe(2);
  });

  it("calls anything under one month thin rather than covered", () => {
    const s = billingStatus({ balance: 4999, monthly: 5000 });
    expect(s.state).toBe("thin");
    expect(s.monthsAhead).toBe(0);
  });

  it("reports what is owed when the balance is negative", () => {
    const s = billingStatus({ balance: -5000, monthly: 5000 });
    expect(s.state).toBe("behind");
    expect(s.owed).toBe(5000);
    expect(s.short).toBe("Behind by 1 month");
  });

  it("rounds a part-month of arrears up, because it is still owed", () => {
    expect(billingStatus({ balance: -5001, monthly: 5000 }).short).toBe("Behind by 2 months");
    expect(billingStatus({ balance: -1, monthly: 5000 }).short).toBe("Behind by 1 month");
  });

  it("never reports arrears as money available", () => {
    const s = billingStatus({ balance: -12000, monthly: 5000 });
    expect(s.monthsAhead).toBe(0);
    expect(s.owed).toBeGreaterThan(0);
  });

  it("copes with nulls and strings from the database", () => {
    expect(billingStatus({ balance: null, monthly: null }).state).toBe("free");
    expect(billingStatus({ balance: "5000", monthly: "5000" }).state).toBe("ahead");
    expect(billingStatus({}).state).toBe("free");
  });

  it("uses singular and plural correctly", () => {
    expect(billingStatus({ balance: 5000, monthly: 5000 }).short).toBe("1 month ahead");
    expect(billingStatus({ balance: 10000, monthly: 5000 }).short).toBe("2 months ahead");
  });
});

describe("withRunningBalance", () => {
  const e = (id, iso, amount) => ({ id, createdAt: iso, amount });

  it("returns newest first with the balance each row left behind", () => {
    const out = withRunningBalance([
      e("b", "2026-11-03T10:00:00Z", 5000),    // payment
      e("a", "2026-11-02T10:00:00Z", -5000),   // charge
    ]);
    expect(out.map((x) => x.id)).toEqual(["b", "a"]);
    expect(out[0].balanceAfter).toBe(0);       // after the payment
    expect(out[1].balanceAfter).toBe(-5000);   // after the charge alone
  });

  it("ends on the same figure as the account balance", () => {
    const entries = [
      e("1", "2026-09-01T00:00:00Z", -5000),
      e("2", "2026-09-05T00:00:00Z", 20000),
      e("3", "2026-10-01T00:00:00Z", -5000),
      e("4", "2026-11-01T00:00:00Z", -5000),
    ];
    const out = withRunningBalance(entries);
    const total = entries.reduce((t, x) => t + x.amount, 0);
    expect(out[0].balanceAfter).toBe(total);
  });

  it("does not mutate what it was given", () => {
    const entries = [e("1", "2026-01-02T00:00:00Z", 10), e("2", "2026-01-01T00:00:00Z", 20)];
    const copy = JSON.parse(JSON.stringify(entries));
    withRunningBalance(entries);
    expect(entries).toEqual(copy);
  });

  it("orders entries sharing a timestamp predictably", () => {
    const out = withRunningBalance([
      e("z", "2026-11-01T00:00:00Z", 100),
      e("a", "2026-11-01T00:00:00Z", -40),
    ]);
    expect(out.map((x) => x.id)).toEqual(["z", "a"]);
    expect(out[0].balanceAfter).toBe(60);
  });

  it("handles an empty ledger", () => {
    expect(withRunningBalance([])).toEqual([]);
    expect(withRunningBalance(null)).toEqual([]);
  });

  it("keeps kobo from drifting across many rows", () => {
    const entries = Array.from({ length: 30 }, (_, i) =>
      e(String(i), `2026-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00Z`, 0.1));
    expect(withRunningBalance(entries)[0].balanceAfter).toBe(3);
  });
});

describe("prettyWhat", () => {
  it("turns a ledger period into something a customer reads", () => {
    expect(prettyWhat("Subscription — 2026-11")).toBe("Subscription · November 2026");
    expect(prettyWhat("Subscription - 2026-01")).toBe("Subscription · January 2026");
  });

  it("leaves ordinary descriptions alone", () => {
    expect(prettyWhat("Wallet funding")).toBe("Wallet funding");
    expect(prettyWhat("Annual payment")).toBe("Annual payment");
  });

  it("does not mangle a description that merely contains a dash", () => {
    expect(prettyWhat("Annual discount — two months free")).toBe("Annual discount — two months free");
  });

  it("gives something to render for a blank description", () => {
    expect(prettyWhat("")).toBe("—");
    expect(prettyWhat(null)).toBe("—");
  });

  it("ignores an impossible month rather than inventing one", () => {
    expect(prettyWhat("Subscription — 2026-13")).toBe("Subscription — 2026-13");
  });
});

describe("coveredUntil", () => {
  const from = new Date("2026-11-03T12:00:00Z");

  it("gives nothing to show when there is no monthly charge", () => {
    expect(coveredUntil({ balance: 50000, monthly: 0, from })).toBeNull();
  });

  it("gives nothing to show when the wallet is empty or behind", () => {
    expect(coveredUntil({ balance: 0, monthly: 5000, from })).toBeNull();
    expect(coveredUntil({ balance: -5000, monthly: 5000, from })).toBeNull();
  });

  it("counts whole months forward", () => {
    const d = coveredUntil({ balance: 15000, monthly: 5000, from });
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(1);          // February
  });

  /* The case that prompted this: a year bought at three staff, then the
     headcount grows. The same ₦60,000 has to cover a bigger charge, and
     the date must come back towards us rather than stay put. */
  it("moves closer when the monthly charge rises", () => {
    const quiet = coveredUntil({ balance: 60000, monthly: 5000, from });
    const grown = coveredUntil({ balance: 60000, monthly: 9000, from });
    expect(grown.getTime()).toBeLessThan(quiet.getTime());
  });

  it("is roughly twelve months for a year's credit at the rate it was bought", () => {
    const d = coveredUntil({ balance: 60000, monthly: 5000, from });
    const months = (d.getFullYear() - 2026) * 12 + (d.getMonth() - 10);
    expect(months).toBe(12);
  });

  it("handles a part month", () => {
    const d = coveredUntil({ balance: 7500, monthly: 5000, from });   // 1.5 months
    expect(d.getTime()).toBeGreaterThan(new Date("2026-12-03T12:00:00Z").getTime());
    expect(d.getTime()).toBeLessThan(new Date("2026-12-25T12:00:00Z").getTime());
  });

  /* Adding a month to the 31st must not skip February entirely. */
  it("does not overshoot from the end of a long month", () => {
    const d = coveredUntil({ balance: 5000, monthly: 5000, from: new Date("2027-01-31T12:00:00Z") });
    expect(d.getMonth()).toBe(1);          // February, not March
  });

  it("never returns a date in the past", () => {
    const d = coveredUntil({ balance: 1, monthly: 5000, from });
    expect(d.getTime()).toBeGreaterThanOrEqual(from.getTime() - 86400000);
  });
});

describe("seatPosition", () => {
  // Growth: ₦5,000 covers ten, then ₦800 a head, no cap.
  const growth = { includedSeats: 10, perSeatBeyond: 800, seatCap: null };

  it("costs nothing inside the included seats", () => {
    const s = seatPosition({ seats: 3, ...growth });
    expect(s.extra).toBe(0);
    expect(s.extraCost).toBe(0);
    expect(s.charging).toBe(false);
    expect(s.remaining).toBe(7);
  });

  /* The case Ade raised: three staff, add two, still free. */
  it("confirms a hire inside the bundle is free", () => {
    const s = seatPosition({ seats: 3, adding: 2, ...growth });
    expect(s.used).toBe(5);
    expect(s.charging).toBe(false);
    expect(s.extraCost).toBe(0);
  });

  it("starts charging at the first seat past the bundle", () => {
    expect(seatPosition({ seats: 10, ...growth }).charging).toBe(false);
    const eleven = seatPosition({ seats: 11, ...growth });
    expect(eleven.charging).toBe(true);
    expect(eleven.extra).toBe(1);
    expect(eleven.extraCost).toBe(800);
  });

  it("prices several extra seats", () => {
    expect(seatPosition({ seats: 15, ...growth }).extraCost).toBe(4000);
  });

  it("can price a hire that has not happened yet", () => {
    const s = seatPosition({ seats: 10, adding: 1, ...growth });
    expect(s.charging).toBe(true);
    expect(s.extraCost).toBe(800);
  });

  /* Small Business bundles ten seats and sells no more. Being at the
     limit is not the same as being charged for going over it. */
  it("separates a capped plan from a billable one", () => {
    const small = seatPosition({ seats: 10, includedSeats: 10, perSeatBeyond: 0, seatCap: 10 });
    expect(small.atCap).toBe(true);
    expect(small.charging).toBe(false);
  });

  it("does not call a free extra seat a charge", () => {
    const s = seatPosition({ seats: 12, includedSeats: 10, perSeatBeyond: 0, seatCap: null });
    expect(s.extra).toBe(2);
    expect(s.charging).toBe(false);
    expect(s.extraCost).toBe(0);
  });

  it("copes with nulls and strings from the database", () => {
    const s = seatPosition({ seats: "11", includedSeats: "10", perSeatBeyond: "800", seatCap: null });
    expect(s.extraCost).toBe(800);
    expect(seatPosition({}).extra).toBe(0);
  });
});
