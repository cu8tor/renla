/* =====================================================================
   sync.js — writes changes to Supabase.

   The app keeps its whole workspace in one `db` object and edits it with
   plain state updates. Rather than rewriting every one of those call
   sites, this module compares the previous snapshot with the new one and
   issues only the inserts, updates and deletes that actually changed.

   That means each write is small and specific, so the database's security
   rules apply properly — an employee writing their own leave request
   sends exactly that one row.
   ===================================================================== */

import { supabase, uploadSelfie, deleteSelfies } from "./supabase.js";

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const byId = (list = []) => Object.fromEntries(list.map((x) => [x.id, x]));

/* ---------------------------------------------------------------------
   How each collection maps onto a table
   ------------------------------------------------------------------ */

const employeeRow = (e, cid) => ({
  id: e.id, company_id: cid, full_name: e.name, email: e.email || "",
  phone: e.phone || "", dob: e.dob || null, gender: e.gender || "",
  marital: e.marital || "", area: e.area || "", job_title: e.title || "",
  department: e.dept || "", manager_id: e.managerId || null,
  joined: e.joined || null, contract: e.contract || "Full-time",
  status: e.status || "Active", next_of_kin: e.kin || "",
  emergency: e.emergency || "", balances: e.bal || {}, check_prefs: e.checkPrefs || {},
  branch_id: e.branchId || null, shift_id: e.shiftId || "", contract_end: e.contractEnd || null,
  week_schedule: e.weekSchedule || null, schedule_mode: e.scheduleMode || "pattern",
});

const payRow = (e, cid) => ({
  employee_id: e.id, company_id: cid,
  basic: e.pay?.basic || 0, transport: e.pay?.transport || 0,
  bonus: e.pay?.bonus || 0, holiday_pay: e.pay?.holiday || 0,
  sunday_pay: e.pay?.sunday || 0, other_allowance: e.pay?.other || 0,
  annual_rent: e.pay?.annualRent || 0,
  pension_rate: e.pay?.pensionRate ?? null,
  nhis: e.pay?.nhis || 0, life_insurance: e.pay?.lifeIns || 0,
  mortgage: e.pay?.mortgage || 0, other_allowable: e.pay?.otherAllowable || 0,
  nin: e.nin || "", bvn: e.bvn || "", tin: e.tin || "",
  rsa_pin: e.pension || "", bank: e.bank || "",
  account_name: e.acctName || "", account_number: e.acct || "",
});

const MAP = {
  leave: {
    table: "leave_requests",
    row: (l, cid) => ({
      id: l.id, company_id: cid, employee_id: l.empId, leave_type: l.type,
      from_date: l.from, to_date: l.to, days: l.days, reason: l.reason || "",
      status: l.status, applied: l.applied,
    }),
  },
  checks: {
    table: "presence_checks",
    row: (c, cid) => ({
      id: c.id, company_id: cid, employee_id: c.empId, check_date: c.date,
      due_time: c.dueTime, answered_at: c.answeredAt || "", status: c.status,
      location: c.loc || null,
      selfie_path: c.selfie && !c.selfie.startsWith("data:") ? c.selfie : "",
      minutes_late: c.minutesLate || 0, note: c.note || "",
    }),
  },
  branches: {
    table: "branches",
    row: (b, cid) => ({
      id: b.id, company_id: cid, name: b.name, address: b.address || "",
      week_schedule: b.weekSchedule || null,
      use_company_schedule: b.useCompanySchedule !== false,
    }),
  },
  permissions: {
    table: "permissions",
    row: (x, cid) => ({
      id: x.id, company_id: cid, employee_id: x.empId, kind: x.kind, category: x.category,
      on_date: x.date, from_time: x.fromTime || "", to_time: x.toTime || "",
      reason: x.reason || "", area: x.area || "",
      location: x.loc ? { ...x.loc, capturedAt: x.capturedAt || "" } : null,
      status: x.status, applied: x.applied,
    }),
  },
  attendance: {
    table: "attendance",
    row: (a, cid) => ({
      id: a.id, company_id: cid, employee_id: a.empId, work_date: a.date,
      clock_in: a.clockIn || "", clock_out: a.clockOut || "",
      in_location: a.inLoc || null, out_location: a.outLoc || null,
      selfie_path: a.selfie && !a.selfie.startsWith("data:") ? a.selfie : "",
      device_id: a.deviceId || "", device_label: a.deviceLabel || "",
      ip_address: a.ip || "", checks: a.checks || {},
      status: a.status || "approved", late: Boolean(a.late),
      review_note: a.reviewNote || "", note: a.note || "",
    }),
  },
  shifts: {
    table: "shifts",
    row: (s, cid) => ({
      id: s.id, company_id: cid, employee_id: s.empId, shift_date: s.date,
      start_time: s.start, end_time: s.end, note: s.note || "",
    }),
  },
  sites: {
    table: "sites",
    row: (s, cid) => ({ id: s.id, company_id: cid, name: s.name, lat: s.lat, lng: s.lng, radius: s.radius }),
  },
  devices: {
    table: "devices",
    row: (d, cid) => ({
      id: d.id, company_id: cid, employee_id: d.empId, device_id: d.deviceId,
      label: d.label || "", status: d.status,
      requested: d.requested || null, approved: d.approved || null,
    }),
  },
  loans: {
    table: "loans",
    row: (l, cid) => ({
      id: l.id, company_id: cid, employee_id: l.empId, loan_type: l.type,
      amount: l.amount, months: l.months, monthly: l.monthly,
      reason: l.reason || "", status: l.status, repaid: l.repaid || 0,
      requested: l.requested || null, approved: l.approved || null,
    }),
  },
  news: {
    table: "news_posts",
    row: (n, cid) => ({
      id: n.id, company_id: cid, author_id: n.authorId || null,
      author_name: n.author || "", author_role: n.role || "",
      title: n.title, body: n.body || "", category: n.category,
      pinned: Boolean(n.pinned), likes: n.likes || 0, posted: n.date,
    }),
  },
  docs: {
    table: "documents",
    row: (d, cid) => ({
      id: d.id, company_id: cid, name: d.name, category: d.cat,
      version: d.ver, file_path: d.filePath || "", link: d.link || "",
      hr_only: Boolean(d.hrOnly), updated: d.updated,
    }),
  },
  holidays: {
    table: "holidays",
    row: (h, cid) => ({ id: h.id, company_id: cid, name: h.name, holiday_date: h.date }),
  },
  payruns: {
    table: "payruns",
    row: (r, cid) => ({
      id: r.id, company_id: cid, month: r.month, status: r.status, lines: r.lines || [],
    }),
  },
};

/* ---------------------------------------------------------------------
   The diff
   ------------------------------------------------------------------ */

export async function syncChanges(prev, next, companyId) {
  if (!prev || !next) return { patches: [], errors: [] };
  const errors = [];
  const patches = [];
  const run = async (label, promise) => {
    const { error } = await promise;
    if (error) errors.push(`${label}: ${error.message}`);
  };

  /* --- selfies: a freshly taken photo arrives as a data URL. Put it in
         storage, then store only the path on the row. --- */
  for (const c of next.checks || []) {
    if (c.selfie && c.selfie.startsWith("data:")) {
      try {
        const path = await uploadSelfie(c.selfie, companyId, c.empId, c.date + "-" + c.dueTime.replace(":", ""));
        patches.push({ collection: "checks", id: c.id, changes: { selfie: path } });
        c.selfie = path;
      } catch (e) { errors.push(`check photo: ${e.message}`); c.selfie = ""; }
    }
  }
  for (const a of next.attendance || []) {
    if (a.selfie && a.selfie.startsWith("data:")) {
      try {
        const path = await uploadSelfie(a.selfie, companyId, a.empId, a.date);
        patches.push({ collection: "attendance", id: a.id, changes: { selfie: path } });
        a.selfie = path; // so the row we write below carries the path
      } catch (e) {
        errors.push(`selfie upload: ${e.message}`);
        a.selfie = "";
      }
    }
  }

  /* --- the other half of selfie handling: actually delete the photo file
         when a record that had one is pruned (see App.jsx's update(), which
         clears the `selfie` field on records older than 90 days) or deleted
         outright (e.g. HR removing a bad attendance record). Previously
         only the database's pointer to the file was ever cleared/removed —
         the image itself stayed in storage indefinitely. A stored path
         starting with "data:" is a photo that never finished uploading
         this session, so there's nothing in storage yet to delete for it. */
  {
    const stalePaths = [];
    for (const collection of ["attendance", "checks"]) {
      const n = byId(next[collection]);
      for (const before of prev[collection] || []) {
        if (!before.selfie || before.selfie.startsWith("data:")) continue;
        const after = n[before.id];
        if (!after || !after.selfie) stalePaths.push(before.selfie);
      }
    }
    if (stalePaths.length) await run("delete old selfie photos", deleteSelfies(stalePaths));
  }

  /* --- employees (plus their separate pay record) --- */
  {
    const p = byId(prev.employees), n = byId(next.employees);
    for (const id of Object.keys(n)) {
      const before = p[id], after = n[id];
      if (!before) {
        await run("add employee", supabase.from("employees").insert(employeeRow(after, companyId)));
        await run("add pay record", supabase.from("employee_pay").insert(payRow(after, companyId)));
      } else if (!eq(before, after)) {
        if (!eq(employeeRow(before, companyId), employeeRow(after, companyId)))
          await run("update employee", supabase.from("employees").update(employeeRow(after, companyId)).eq("id", id));
        if (after.hasPay !== false && !eq(payRow(before, companyId), payRow(after, companyId)))
          await run("update pay", supabase.from("employee_pay").upsert(payRow(after, companyId), { onConflict: "employee_id" }));
      }
    }
    for (const id of Object.keys(p)) {
      if (!n[id]) await run("remove employee", supabase.from("employees").delete().eq("id", id));
    }
  }

  /* --- the straightforward collections --- */
  for (const [keyName, cfg] of Object.entries(MAP)) {
    const p = byId(prev[keyName]), n = byId(next[keyName]);
    for (const id of Object.keys(n)) {
      const before = p[id], after = n[id];
      if (!before) {
        await run(`add ${keyName}`, supabase.from(cfg.table).insert(cfg.row(after, companyId)));
      } else if (!eq(cfg.row(before, companyId), cfg.row(after, companyId))) {
        await run(`update ${keyName}`, supabase.from(cfg.table).update(cfg.row(after, companyId)).eq("id", id));
      }
    }
    for (const id of Object.keys(p)) {
      if (!n[id]) await run(`remove ${keyName}`, supabase.from(cfg.table).delete().eq("id", id));
    }
  }

  /* --- departments are a plain list of names --- */
  {
    const before = prev.departments || [], after = next.departments || [];
    for (const name of after) {
      if (!before.includes(name))
        await run("add department", supabase.from("departments").insert({ company_id: companyId, name }));
    }
    for (const name of before) {
      if (!after.includes(name))
        await run("remove department", supabase.from("departments").delete().eq("company_id", companyId).eq("name", name));
    }
  }

  /* --- settings and company details --- */
  if (!eq(prev.work, next.work) || !eq(prev.payroll, next.payroll)) {
    await run("save settings", supabase.from("company_settings")
      .update({ work: next.work, payroll: next.payroll, updated_at: new Date().toISOString() })
      .eq("company_id", companyId));
  }
  if (!eq(prev.company, next.company)) {
    await run("save company", supabase.from("companies")
      .update({ name: next.company.name, address: next.company.address || "" })
      .eq("id", companyId));
  }

  return { patches, errors };
}
