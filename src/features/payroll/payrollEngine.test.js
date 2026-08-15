/* =====================================================================
   payrollEngine.test.js

   These tests validate the same claims the product blueprint made by
   hand ("PAYE reproduces the uploaded template exactly", "all six band
   boundaries correct", "a repayment must never push pay below zero"),
   but against fully-controlled synthetic inputs rather than the
   blueprint's original (undisclosed) employee record —
   so every expected number below is hand-verified from the NTA 2025
   bands and the formulas in computePayslip itself, not copied from the
   blueprint. If you want the *exact* ₦155,000 → ₦11,500 → ₦143,500
   example locked in as a regression test too, paste that employee's
   pay fields (basic/transport/bonus/etc., rent, any pension override)
   and it can be added as an additional case here.
   ===================================================================== */

import { describe, it, expect } from "vitest";
import {
  NTA2025_BANDS,
  DEFAULT_PAYROLL,
  calendarWorkingDays,
  payeAnnual,
  computePayslip,
} from "./payrollEngine.js";

describe("payeAnnual — NTA 2025 bands", () => {
  it("charges nothing at or below the first band's ceiling (₦800,000)", () => {
    expect(payeAnnual(0, NTA2025_BANDS)).toBe(0);
    expect(payeAnnual(800000, NTA2025_BANDS)).toBe(0);
  });

  it("taxes only the portion inside the 15% band (₦800,000–₦3,000,000)", () => {
    // 1,800,000 taxable: (1,800,000 - 800,000) * 15% = 150,000
    expect(payeAnnual(1800000, NTA2025_BANDS)).toBe(150000);
  });

  it("is correct exactly at the second boundary (₦3,000,000)", () => {
    // (3,000,000 - 800,000) * 15% = 330,000, nothing yet in the 18% band
    expect(payeAnnual(3000000, NTA2025_BANDS)).toBe(330000);
  });

  it("spills into the 18% band just above ₦3,000,000", () => {
    // 330,000 (band 2, full) + (4,000,000 - 3,000,000) * 18% = 330,000 + 180,000
    expect(payeAnnual(4000000, NTA2025_BANDS)).toBe(510000);
  });

  it("is correct across all six bands at once (₦60,000,000 taxable)", () => {
    // band1  0–800k        @0%  : 0
    // band2  800k–3m       @15% : 2,200,000 * 0.15 = 330,000
    // band3  3m–12m        @18% : 9,000,000 * 0.18 = 1,620,000
    // band4  12m–25m       @21% : 13,000,000 * 0.21 = 2,730,000
    // band5  25m–50m       @23% : 25,000,000 * 0.23 = 5,750,000
    // band6  50m+          @25% : 10,000,000 * 0.25 = 2,500,000
    // total = 12,930,000
    expect(payeAnnual(60000000, NTA2025_BANDS)).toBe(12930000);
  });
});

describe("calendarWorkingDays", () => {
  it("counts weekdays in a month with no public holidays", () => {
    expect(calendarWorkingDays("2026-02", [])).toBe(20);
  });

  it("excludes a public holiday that falls on a weekday", () => {
    expect(calendarWorkingDays("2026-02", [{ date: "2026-02-16" }])).toBe(19);
  });
});

describe("computePayslip", () => {
  const emp = {
    pay: {
      basic: 100000, transport: 20000, bonus: 0, holiday: 0, sunday: 0, other: 0,
      annualRent: 0, pensionRate: null, nhis: 0, lifeIns: 0, mortgage: 0, otherAllowable: 0,
    },
  };

  it("computes gross, PAYE, pension and net correctly for a plain monthly salary", () => {
    const calc = computePayslip(emp, DEFAULT_PAYROLL);

    expect(calc.gross).toBe(120000);           // 100,000 basic + 20,000 transport
    expect(calc.pension).toBe(9600);            // 120,000 * 8%
    expect(calc.paye).toBe(6560);                // see payeAnnual math in comments below
    expect(calc.deductions.paye).toBe(6560);
    expect(calc.totalDeductions).toBe(16160);    // 6,560 PAYE + 9,600 pension
    expect(calc.net).toBe(103840);               // 120,000 - 16,160

    // annualGross 1,440,000; allowableAnnual (pension only) 115,200;
    // taxableAnnual 1,324,800 → payeAnnual = (1,324,800 - 800,000) * 15% = 78,720
    // → monthly PAYE = round(78,720 / 12) = 6,560
    expect(payeAnnual(calc.taxableAnnual, NTA2025_BANDS)).toBe(78720);
  });

  it("computes employer-side contributions independently of employee deductions", () => {
    const calc = computePayslip(emp, DEFAULT_PAYROLL);
    expect(calc.employer.pension).toBe(12000);   // 120,000 * 10% (employer rate)
    expect(calc.employer.nsitf).toBe(1200);      // 120,000 * 1%
    expect(calc.employer.itf).toBe(1200);        // 120,000 * 1%
    expect(calc.employer.total).toBe(14400);
  });

  it("never lets a loan repayment push net pay below zero", () => {
    // Same employee, but requesting a ₦200,000 loan repayment this run —
    // far more than what's left after PAYE and pension (₦103,840 affordable).
    const calc = computePayslip(emp, DEFAULT_PAYROLL, { loan: 200000 });

    expect(calc.deductions.loan).toBe(103840);   // capped to what's actually affordable
    expect(calc.loanShortfall).toBe(96160);      // 200,000 - 103,840, carried forward, not lost
    expect(calc.net).toBe(0);                    // floored at zero, never negative
  });

  it("does not touch the loan cap when the loan comfortably fits", () => {
    const calc = computePayslip(emp, DEFAULT_PAYROLL, { loan: 20000 });
    expect(calc.deductions.loan).toBe(20000);
    expect(calc.loanShortfall).toBe(0);
    expect(calc.net).toBe(103840 - 20000);
  });
});
