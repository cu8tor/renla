import { DEFAULT_PAYROLL, emptyPay } from "../features/payroll/payrollEngine.js";
import { pad2 } from "../features/attendance/attendanceLogic.js";
import { uid, todayISO } from "./format.js";
import { DEFAULT_WORK } from "./presence.js";
import { blankBalances } from "../features/insights/monthInsights.js";
import { DEFAULT_ONBOARDING } from "./onboarding.js";

const monthKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
const monthLabel = (k) => { const [y, m] = k.split("-").map(Number); return `${["January","February","March","April","May","June","July","August","September","October","November","December"][m - 1]} ${y}`; };
const monthOptions = (n = 12) => [...Array(n)].map((_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return monthKey(d); });
function normalizeDb(d) {
  if (!d) return d;
  return {
    ...d,
    departments: d.departments || [],
    leave: d.leave || [],
    permissions: d.permissions || [],
    branches: d.branches || [],
    checks: d.checks || [],
    news: d.news || [],
    docs: d.docs || [],
    holidays: d.holidays || [],
    users: d.users || [],
    attendance: d.attendance || [],
    shifts: d.shifts || [],
    sites: d.sites || [],
    devices: d.devices || [],
    loans: d.loans || [],
    payruns: d.payruns || [],
    payroll: { ...DEFAULT_PAYROLL, ...(d.payroll || {}) },
    onboarding: { ...DEFAULT_ONBOARDING, ...(d.onboarding || {}) },
    employeeDocs: d.employeeDocs || [],
    employees: (d.employees || []).map((e) =>
      e.pay
        ? { ...e, checkPrefs: e.checkPrefs || {}, referenceName: e.referenceName || "", referencePhone: e.referencePhone || "", referenceRelationship: e.referenceRelationship || "", avatarPath: e.avatarPath || "" }
        : { ...e, bvn: e.bvn || "", checkPrefs: e.checkPrefs || {}, pay: { ...emptyPay(), basic: Number(e.salary) || 0, annualRent: 0 }, referenceName: e.referenceName || "", referencePhone: e.referencePhone || "", referenceRelationship: e.referenceRelationship || "", avatarPath: e.avatarPath || "" }
    ),
    work: { ...DEFAULT_WORK, ...(d.work || {}) },
  };
}
function emptyEmployee() {
  return {
    id: uid("emp"), name: "", email: "", phone: "", dob: "", gender: "", marital: "", area: "",
    dept: "", title: "", managerId: "", joined: todayISO(), contract: "Full-time", status: "Active",
    salary: 0, nin: "", bvn: "", tin: "", pension: "", bank: "", acctName: "", acct: "", pay: emptyPay(),
    kin: "", emergency: "", referenceName: "", referencePhone: "", referenceRelationship: "", avatarPath: "",
    bal: blankBalances(), checkPrefs: {}, branchId: "", shiftId: "", contractEnd: "",
    weekSchedule: null, scheduleMode: "pattern",
  };
}
function ytdFor(db, empId, upToMonth) {
  const year = upToMonth.slice(0, 4);
  const z = { basic:0, transport:0, bonus:0, holiday:0, sunday:0, other:0, gross:0,
    paye:0, pension:0, nhf:0, nhis:0, lifeIns:0, mortgage:0, loan:0, lateness:0, absence:0, otherDed:0, totalDeductions:0, net:0 };
  db.payruns.filter((r) => r.status === "finalised" && r.month.startsWith(year) && r.month <= upToMonth).forEach((r) => {
    const ln = r.lines.find((l) => l.empId === empId);
    if (!ln) return;
    const c = ln.calc;
    ["basic","transport","bonus","holiday","sunday","other"].forEach((k) => { z[k] += c.earnings[k] || 0; });
    Object.keys(c.deductions).forEach((k) => { if (k in z) z[k] += c.deductions[k] || 0; });
    z.gross += c.gross; z.totalDeductions += c.totalDeductions; z.net += c.net;
  });
  return z;
}

export { monthKey, monthLabel, monthOptions, normalizeDb, emptyEmployee, ytdFor };
