/* =====================================================================
   payrollEngine.js — extracted verbatim from App.jsx (V1 modularisation).
   Nigeria Tax Act 2025 PAYE, pension, rent relief, lateness/overtime,
   and loan-shortfall-safe deduction logic. Behaviour is unchanged from
   the version tested against the blueprint's worked examples — see
   payrollEngine.test.js.
   ===================================================================== */

// -- small date helpers this module depends on (also extracted verbatim) --
const parseD = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pad2 = (n) => String(n).padStart(2, "0");
// Was missing entirely — personalOutMinutes/lateStatsFor called this without
// it being imported or defined anywhere in this module, so any payroll run
// touching an employee with an approved personal-time-out request that month
// threw a ReferenceError partway through building the run (buildLine's
// .map over active employees, in App.jsx). Definition copied verbatim from
// attendanceLogic.js's hmToMin, same as the other date helpers above.
const hmToMin = (hm) => { if (!hm || !hm.includes(":")) return null; const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

const NTA2025_BANDS = [
  { from: 0, to: 800000, rate: 0 },
  { from: 800000, to: 3000000, rate: 0.15 },
  { from: 3000000, to: 12000000, rate: 0.18 },
  { from: 12000000, to: 25000000, rate: 0.21 },
  { from: 25000000, to: 50000000, rate: 0.23 },
  { from: 50000000, to: null, rate: 0.25 },
];
const DEFAULT_PAYROLL = {
  bands: NTA2025_BANDS,
  overtimeRate: 1.5,           // multiplier on the hourly rate
  payOvertime: false,
  personalTimeDeduct: false,   // dock pay for approved *personal* time out of the office
  rentReliefRate: 20,
  rentReliefCap: 500000,
  pensionRate: 8,
  nhfRate: 0,
  workingDays: 26,
  workingDaysMode: "fixed",     // "fixed" | "calendar" (weekdays minus public holidays)
  payBasis: "full",             // "full" = monthly salary regardless | "daysWorked" = pro-rate by attendance
  latenessMode: "none",         // "none" | "prorata" (per late minute) | "fixed" (flat fee per late day)
  latenessFee: 1000,            // ₦ per late day when latenessMode = "fixed"
  employerPension: 10,          // %
  nsitfRate: 1,                 // % of payroll (employer)
  itfRate: 1,                   // % of payroll (employer, 5+ staff)
  payslipTemplate: "detailed",  // "simple" | "detailed"
};

/* Weekdays in a month, minus any public holidays that fall on one */
function calendarWorkingDays(mKey, holidays = []) {
  const [y, m] = mKey.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  let n = 0;
  for (let day = 1; day <= last; day++) {
    const d = new Date(y, m - 1, day);
    const wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    if (holidays.some((h) => h.date === iso(d))) continue;
    n++;
  }
  return n;
}
const resolveWorkingDays = (payroll, mKey, holidays) =>
  payroll.workingDaysMode === "calendar" ? calendarWorkingDays(mKey, holidays) : (Number(payroll.workingDays) || 26);

/* Total minutes late across a month, measured against the company's opening time */
function lateStatsFor(attendance, empId, mKey, work, excusedDates = []) {
  const open = hmToMin(work.dayStart) + (Number(work.graceMins) || 0);
  let minutes = 0, days = 0, excused = 0;
  attendance.filter((a) => a.empId === empId && a.date.startsWith(mKey) && a.clockIn).forEach((a) => {
    const inMin = hmToMin(a.clockIn);
    if (inMin == null || inMin <= open) return;
    // Approved in advance? Then it isn't a penalty.
    if (excusedDates.includes(a.date)) { excused += 1; return; }
    minutes += inMin - open; days += 1;
  });
  return { lateMinutes: minutes, lateDays: days, excusedLateDays: excused };
}

/* Minutes spent out of the office on approved *personal* business */
function personalOutMinutes(permissions, empId, mKey) {
  return permissions
    .filter((x) => x.empId === empId && x.kind === "excursion" && x.category === "Personal"
                   && x.status === "approved" && (x.date || "").startsWith(mKey))
    .reduce((sum, x) => {
      const a = hmToMin(x.fromTime), b = hmToMin(x.toTime);
      return sum + (a != null && b != null && b > a ? b - a : 0);
    }, 0);
}
const excusedLateDatesFor = (permissions, empId, mKey) => permissions
  .filter((x) => x.empId === empId && x.kind === "late" && x.status === "approved" && (x.date || "").startsWith(mKey))
  .map((x) => x.date);

/* Days with an approved trip out of the office. The day is still theirs —
   they were on approved business, so it must not read as absence, even if
   they never came back to clock out. */
const excursionDatesFor = (permissions, empId, mKey) => permissions
  .filter((x) => x.empId === empId && x.kind === "excursion" && x.status === "approved" && (x.date || "").startsWith(mKey))
  .map((x) => x.date);

/* ---- amount in words (Nigerian payslip convention) ---- */
const W_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const W_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function threeWords(n) {
  let s = "";
  if (n >= 100) { s += W_ONES[Math.floor(n / 100)] + " Hundred"; n %= 100; if (n) s += " and "; }
  if (n >= 20) { s += W_TENS[Math.floor(n / 10)]; if (n % 10) s += "-" + W_ONES[n % 10]; }
  else if (n > 0) s += W_ONES[n];
  return s;
}
function amountInWords(amount) {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return "Zero Naira Only";
  const units = [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]];
  let rest = n, parts = [];
  units.forEach(([v, name]) => {
    if (rest >= v) { parts.push(threeWords(Math.floor(rest / v)) + " " + name); rest %= v; }
  });
  if (rest > 0) parts.push(threeWords(rest));
  return parts.join(", ") + " Naira Only";
}
const emptyPay = () => ({ basic: 0, transport: 0, bonus: 0, holiday: 0, sunday: 0, other: 0, annualRent: 0, pensionRate: null, nhis: 0, lifeIns: 0, mortgage: 0, otherAllowable: 0 });

function payeAnnual(taxable, bands) {
  let tax = 0;
  (bands || NTA2025_BANDS).forEach((b) => {
    const from = Number(b.from) || 0;
    const to = b.to === null || b.to === "" || b.to === undefined ? Infinity : Number(b.to);
    if (taxable > from) tax += (Math.min(taxable, to) - from) * Number(b.rate || 0);
  });
  return Math.max(0, Math.round(tax));
}

/* Follows the uploaded payslip template line for line */
function computePayslip(emp, payroll, extras = {}) {
  const p = { ...emptyPay(), ...(emp.pay || {}) };
  const earnings = {
    basic: Number(p.basic) || 0,
    transport: Number(p.transport) || 0,
    bonus: Number(extras.bonus ?? p.bonus) || 0,
    holiday: Number(extras.holiday ?? p.holiday) || 0,
    sunday: Number(extras.sunday ?? p.sunday) || 0,
    other: Number(extras.other ?? p.other) || 0,
  };
  const gross = Object.values(earnings).reduce((a, b) => a + b, 0);
  const annualGross = gross * 12;

  const rentRelief = Math.min((Number(p.annualRent) || 0) * (payroll.rentReliefRate / 100), payroll.rentReliefCap);
  const pensionRate = p.pensionRate == null ? payroll.pensionRate : Number(p.pensionRate);
  const pension = Math.round(gross * (pensionRate / 100));
  const otherAllowable = Number(p.otherAllowable) || 0;
  const allowableAnnual = (pension + otherAllowable) * 12;

  const taxableAnnual = Math.max(0, annualGross - rentRelief - allowableAnnual);
  const annualTax = payeAnnual(taxableAnnual, payroll.bands);
  const paye = Math.round(annualTax / 12);

  const workingDays = Number(extras.workingDays ?? payroll.workingDays) || 26;
  const daysWorked = Number(extras.daysWorked ?? workingDays);
  const dailyRate = workingDays ? Math.round(gross / workingDays) : 0;
  const unpaidDays = Number(extras.unpaidDays) || 0;
  const paidLeaveDays = Number(extras.leaveDays) || 0;
  const sickDays = Number(extras.sickDays) || 0;

  /* --- absence, per the company's pay basis --- */
  let absentDays = 0;
  if (payroll.payBasis === "daysWorked") {
    absentDays = Math.max(0, workingDays - daysWorked - paidLeaveDays - sickDays - unpaidDays);
  }
  const autoAbsence = (absentDays + unpaidDays) * dailyRate;

  /* --- lateness, measured against the company's opening time --- */
  const lateMinutes = Number(extras.lateMinutes) || 0;
  const lateDays = Number(extras.lateDays) || 0;
  const workMinutesPerDay = Number(extras.workMinutesPerDay) || 480;
  let autoLateness = 0;
  if (payroll.latenessMode === "prorata") autoLateness = Math.round(lateMinutes * (dailyRate / workMinutesPerDay));
  else if (payroll.latenessMode === "fixed") autoLateness = lateDays * (Number(payroll.latenessFee) || 0);

  // Approved personal time out of the office, if the company docks it
  const otMins = Number(extras.overtimeMins) || 0;
  const overtimePay = payroll.payOvertime
    ? Math.round((otMins / 60) * (dailyRate / (workMinutesPerDay / 60)) * (payroll.overtimeRate || 1.5))
    : 0;
  const outMins = Number(extras.personalOutMinutes) || 0;
  const personalOut = payroll.personalTimeDeduct ? Math.round(outMins * (dailyRate / workMinutesPerDay)) : 0;
  autoLateness += personalOut;

  const deductions = {
    paye,
    pension,
    nhf: Math.round((Number(earnings.basic) || 0) * ((payroll.nhfRate || 0) / 100)),
    nhis: Number(p.nhis) || 0,
    lifeIns: Number(p.lifeIns) || 0,
    mortgage: Number(p.mortgage) || 0,
    loan: Number(extras.loan) || 0,
    lateness: Number(extras.lateness ?? autoLateness) || 0,
    absence: Number(extras.absence ?? autoAbsence) || 0,
    otherDed: Number(extras.otherDed) || 0,
  };

  // A repayment must never push someone's pay below zero — take only what's left.
  const withoutLoan = Object.entries(deductions).reduce((a, [k, v]) => (k === "loan" ? a : a + v), 0);
  const affordable = Math.max(0, gross - withoutLoan);
  const loanShortfall = Math.max(0, deductions.loan - affordable);
  deductions.loan = Math.min(deductions.loan, affordable);

  const totalDeductions = Object.values(deductions).reduce((a, b) => a + b, 0);
  const net = gross - totalDeductions;

  /* --- employer-side contributions (shown on the detailed payslip) --- */
  const employer = {
    pension: Math.round(gross * ((payroll.employerPension || 0) / 100)),
    nsitf: Math.round(gross * ((payroll.nsitfRate || 0) / 100)),
    itf: Math.round(gross * ((payroll.itfRate || 0) / 100)),
  };
  employer.total = employer.pension + employer.nsitf + employer.itf;

  return {
    earnings, gross, annualGross, rentRelief, pension, pensionRate, otherAllowable,
    allowableAnnual, taxableAnnual, annualTax, paye, deductions, totalDeductions, loanShortfall,
    net: Math.max(0, net), workingDays, daysWorked, dailyRate, unpaidDays, absentDays,
    lateMinutes, lateDays, employer, overtimeMins: otMins, overtimePay,
    creditedDays: Number(extras.creditedDays) || 0,
    excusedLateDays: Number(extras.excusedLateDays) || 0,
    personalOutMinutes: outMins, personalOutDeduction: personalOut,
    leaveDays: paidLeaveDays, sickDays,
  };
}

export {
  NTA2025_BANDS, DEFAULT_PAYROLL, calendarWorkingDays, resolveWorkingDays, amountInWords, emptyPay, payeAnnual, computePayslip,
  // Attendance/leave helpers that were bundled in the same original block and are consumed
  // by monthInsights and PayrollPage's extras-building step (fixed after a live-render check
  // caught they'd been silently dropped from App.jsx's imports — see delivery notes).
  lateStatsFor, personalOutMinutes, excusedLateDatesFor, excursionDatesFor,
};
