import { emptyPay } from "../features/payroll/payrollEngine.js";
import { minToHM, addDays, mondayOf } from "../features/attendance/attendanceLogic.js";
import { uid, iso, todayISO, startOfToday } from "./format.js";
import { DEFAULT_WORK } from "./presence.js";
import { emptyEmployee } from "./payrollHelpers.js";

function sampleData() {
  const e = (o) => {
    const base = { ...emptyEmployee(), ...o };
    const g = Number(base.salary) || 0;
    return { ...base, bvn: "22" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0"),
      pay: { ...emptyPay(), basic: Math.round(g * 0.6), transport: Math.round(g * 0.25), other: g - Math.round(g * 0.6) - Math.round(g * 0.25), annualRent: Math.round(g * 12 * 0.25) } };
  };
  const E1 = e({ id: "emp_ade", name: "Adaeze Okafor", email: "adaeze.okafor@example.ng", phone: "+234 803 221 0098", dob: "1989-11-12", gender: "Female", marital: "Married", area: "Lekki, Lagos", dept: "People", title: "People Lead", joined: "2021-02-01", salary: 1350000, nin: "83920114772", tin: "1002991-0001", pension: "PEN100299118", bank: "GTBank", acctName: "Adaeze N. Okafor", acct: "0123991002", kin: "Chinedu Okafor · Spouse", emergency: "Chinedu Okafor · +234 802 118 4410", bal: { annual: 20, sick: 10, comp: 5 } });
  const E2 = e({ id: "emp_tun", name: "Tunde Bakare", email: "tunde.bakare@example.ng", phone: "+234 809 774 5521", dob: "1985-04-09", gender: "Male", marital: "Married", area: "Ikeja, Lagos", dept: "Engineering", title: "Engineering Manager", joined: "2020-09-14", salary: 2100000, nin: "70021884553", tin: "1004410-0002", pension: "PEN100441022", bank: "Zenith Bank", acctName: "Tunde A. Bakare", acct: "2019004410", kin: "Bisola Bakare · Spouse", emergency: "Bisola Bakare · +234 803 900 7712", bal: { annual: 18, sick: 10, comp: 5 } });
  const E3 = e({ id: "emp_chi", name: "Chidi Nwosu", email: "chidi.nwosu@example.ng", phone: "+234 812 004 3390", dob: "1996-07-30", gender: "Male", marital: "Single", area: "Yaba, Lagos", dept: "Engineering", title: "Frontend Developer", managerId: "emp_tun", joined: "2023-03-06", salary: 850000, nin: "55102299874", tin: "1009981-0004", pension: "PEN100998104", bank: "Kuda", acctName: "Chidi E. Nwosu", acct: "3009981004", kin: "Ada Nwosu · Sister", emergency: "Ada Nwosu · +234 810 552 9981", bal: { annual: 17, sick: 9, comp: 5 } });
  const E4 = e({ id: "emp_ngo", name: "Ngozi Eze", email: "ngozi.eze@example.ng", phone: "+234 806 551 2200", dob: "1994-01-22", gender: "Female", marital: "Single", area: "Surulere, Lagos", dept: "Engineering", title: "Backend Developer", managerId: "emp_tun", joined: "2022-11-01", salary: 920000, nin: "44900221765", tin: "1007712-0005", pension: "PEN100771205", bank: "Access Bank", acctName: "Ngozi C. Eze", acct: "0770012205", kin: "Uchenna Eze · Brother", emergency: "Uchenna Eze · +234 705 220 1188" });
  const E5 = e({ id: "emp_fat", name: "Fatima Bello", email: "fatima.bello@example.ng", phone: "+234 802 993 1140", dob: "1990-08-14", gender: "Female", marital: "Married", area: "Victoria Island, Lagos", dept: "Product", title: "Product Manager", managerId: "emp_ade", joined: "2021-07-19", salary: 1450000, nin: "61120099432", tin: "1003310-0006", pension: "PEN100331006", bank: "UBA", acctName: "Fatima I. Bello", acct: "2033109006", kin: "Ibrahim Bello · Spouse", emergency: "Ibrahim Bello · +234 803 118 9932", bal: { annual: 15, sick: 8, comp: 5 } });
  const E6 = e({ id: "emp_seu", name: "Oluwaseun Adeyemi", email: "seun.adeyemi@example.ng", phone: "+234 815 220 8841", dob: "1997-05-03", gender: "Male", marital: "Single", area: "Yaba, Lagos", dept: "Design", title: "Product Designer", managerId: "emp_fat", joined: "2023-08-21", salary: 780000, nin: "38820011654", tin: "1008820-0007", pension: "PEN100882007", bank: "First Bank", acctName: "Oluwaseun A. Adeyemi", acct: "3088200007", kin: "Bola Adeyemi · Mother", emergency: "Bola Adeyemi · +234 802 771 3320" });
  const E7 = e({ id: "emp_eme", name: "Emeka Okonkwo", email: "emeka.okonkwo@example.ng", phone: "+234 807 330 1290", dob: "1988-08-06", gender: "Male", marital: "Married", area: "Ikeja, Lagos", dept: "Marketing", title: "Marketing Lead", managerId: "emp_ade", joined: "2020-12-02", salary: 1100000, nin: "29910044328", tin: "1005510-0008", pension: "PEN100551008", bank: "GTBank", acctName: "Emeka J. Okonkwo", acct: "0155108008", kin: "Ifeoma Okonkwo · Spouse", emergency: "Ifeoma Okonkwo · +234 806 220 5510", bal: { annual: 16, sick: 10, comp: 5 } });
  const E8 = e({ id: "emp_ama", name: "Amara Nwachukwu", email: "amara.nwachukwu@example.ng", phone: "+234 810 552 0043", dob: "1995-08-02", gender: "Female", marital: "Single", area: "Lekki, Lagos", dept: "Marketing", title: "Content Strategist", managerId: "emp_eme", joined: "2024-01-15", salary: 620000, nin: "77120033219", tin: "1006620-0009", pension: "PEN100662009", bank: "Kuda", acctName: "Amara P. Nwachukwu", acct: "3066200009", kin: "Ngozi Nwachukwu · Mother", emergency: "Ngozi Nwachukwu · +234 803 662 0011" });
  const E9 = e({ id: "emp_ibr", name: "Ibrahim Musa", email: "ibrahim.musa@example.ng", phone: "+234 803 118 7742", dob: "1986-03-27", gender: "Male", marital: "Married", area: "Ikeja, Lagos", dept: "Operations", title: "Operations Manager", managerId: "emp_ade", joined: "2019-06-10", salary: 1200000, nin: "90021177450", tin: "1007730-0010", pension: "PEN100773010", bank: "Sterling Bank", acctName: "Ibrahim S. Musa", acct: "0077301010", kin: "Aisha Musa · Spouse", emergency: "Aisha Musa · +234 805 773 0022", bal: { annual: 19, sick: 10, comp: 5 } });
  const E10 = e({ id: "emp_hal", name: "Halima Yusuf", email: "halima.yusuf@example.ng", phone: "+234 809 220 6611", dob: "1992-10-18", gender: "Female", marital: "Married", area: "Victoria Island, Lagos", dept: "Finance", title: "Finance Officer", managerId: "emp_ade", joined: "2021-04-05", salary: 950000, nin: "51190022847", tin: "1004420-0011", pension: "PEN100442011", bank: "Zenith Bank", acctName: "Halima A. Yusuf", acct: "2044201011", kin: "Sadiq Yusuf · Spouse", emergency: "Sadiq Yusuf · +234 802 442 0033", bal: { annual: 11, sick: 10, comp: 5 } });
  const E11 = e({ id: "emp_kel", name: "Kelechi Obi", email: "kelechi.obi@example.ng", phone: "+234 814 007 2280", dob: "1998-12-09", gender: "Male", marital: "Single", area: "Surulere, Lagos", dept: "Operations", title: "Customer Support", managerId: "emp_ibr", joined: "2024-05-20", salary: 480000, nin: "62200114093", tin: "1002230-0012", pension: "PEN100223012", bank: "Access Bank", acctName: "Kelechi D. Obi", acct: "0022301012", kin: "Chioma Obi · Sister", emergency: "Chioma Obi · +234 810 223 0044" });
  const E12 = e({ id: "emp_zai", name: "Zainab Suleiman", email: "zainab.suleiman@example.ng", phone: "+234 802 774 5510", dob: "1993-09-25", gender: "Female", marital: "Single", area: "Lekki, Lagos", dept: "Marketing", title: "Sales Executive", managerId: "emp_eme", joined: "2022-08-08", salary: 700000, nin: "48810029965", tin: "1009910-0013", pension: "PEN100991013", bank: "UBA", acctName: "Zainab O. Suleiman", acct: "2099101013", kin: "Musa Suleiman · Father", emergency: "Musa Suleiman · +234 803 991 0055", bal: { annual: 18, sick: 9, comp: 5 } });

  const emps = [E1, E2, E3, E4, E5, E6, E7, E8, E9, E10, E11, E12];
  const y = new Date().getFullYear();
  const mon = mondayOf(new Date());
  const attendance = [];
  const shifts = [];
  emps.forEach((emp, idx) => {
    // last 5 days of attendance for most people
    for (let back = 0; back < 5; back++) {
      if ((idx + back) % 7 === 3) continue; // a few gaps
      const d = iso(addDays(startOfToday(), -back));
      const inMin = 8 * 60 + 45 + ((idx * 7 + back * 13) % 40);
      const outMin = 17 * 60 + ((idx * 5 + back * 11) % 45);
      attendance.push({ id: uid("att"), empId: emp.id, date: d, clockIn: minToHM(inMin), clockOut: back === 0 && idx % 3 === 0 ? "" : minToHM(outMin), note: "" });
    }
    // Mon–Fri shifts this week
    for (let dd = 0; dd < 5; dd++) {
      if ((idx + dd) % 6 === 5) continue;
      shifts.push({ id: uid("sh"), empId: emp.id, date: iso(addDays(mon, dd)), start: idx % 4 === 0 ? "12:00" : "09:00", end: idx % 4 === 0 ? "20:00" : "17:00", note: idx % 4 === 0 ? "Late shift" : "" });
    }
  });
  return {
    attendance, shifts, work: { ...DEFAULT_WORK },
    employees: emps,
    departments: ["People", "Engineering", "Product", "Design", "Marketing", "Operations", "Finance"],
    leave: [
      { id: uid("lv"), empId: "emp_chi", type: "Annual", from: `${y}-08-10`, to: `${y}-08-12`, days: 3, reason: "Family trip to Enugu", status: "pending_manager", applied: todayISO() },
      { id: uid("lv"), empId: "emp_ngo", type: "Sick", from: `${y}-07-29`, to: `${y}-07-30`, days: 2, reason: "Doctor's note attached", status: "pending_manager", applied: todayISO() },
      { id: uid("lv"), empId: "emp_seu", type: "Annual", from: `${y}-08-17`, to: `${y}-08-21`, days: 5, reason: "Personal", status: "pending_hr", applied: todayISO() },
      { id: uid("lv"), empId: "emp_hal", type: "Annual", from: `${y}-07-27`, to: `${y}-07-31`, days: 5, reason: "Rest", status: "approved", applied: `${y}-07-14` },
      { id: uid("lv"), empId: "emp_zai", type: "Compassionate", from: `${y}-07-01`, to: `${y}-07-02`, days: 2, reason: "Bereavement", status: "declined", applied: `${y}-06-28` },
    ],
    news: [
      { id: uid("nw"), authorId: "emp_ade", author: "Adaeze Okafor", role: "People Lead", date: todayISO(), category: "Policy", pinned: true, title: "Updated remote-work policy now live", body: "The remote-work policy is now in the document library. Teams can work remotely up to three days a week with manager sign-off.", likes: 14, liked: false },
      { id: uid("nw"), authorId: "emp_ibr", author: "Ibrahim Musa", role: "Operations Manager", date: todayISO(), category: "Notice", pinned: false, title: "Office closed for Independence Day", body: "The Lagos office will be closed on 1 October for Independence Day. Normal operations resume the following day.", likes: 22, liked: false },
    ],
    docs: [
      { id: uid("dc"), name: "Employee Handbook", cat: "Handbook", ver: "v3.1", updated: todayISO(), hrOnly: false, link: "" },
      { id: uid("dc"), name: "Remote Work Policy", cat: "Policies", ver: "v2.0", updated: todayISO(), hrOnly: false, link: "" },
      { id: uid("dc"), name: "Leave Request Form", cat: "Forms", ver: "v1.0", updated: todayISO(), hrOnly: false, link: "" },
      { id: uid("dc"), name: "Salary Grade Structure", cat: "Templates", ver: "v1.0", updated: todayISO(), hrOnly: true, link: "" },
    ],
    holidays: [
      { id: uid("hd"), date: `${y}-10-01`, name: "Independence Day" },
      { id: uid("hd"), date: `${y}-12-25`, name: "Christmas Day" },
      { id: uid("hd"), date: `${y}-12-26`, name: "Boxing Day" },
      { id: uid("hd"), date: `${y + 1}-01-01`, name: "New Year's Day" },
    ],
  };
}

export { sampleData };
