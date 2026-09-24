/* =====================================================================
   Supabase client, authentication, and loading the workspace.
   ===================================================================== */

import { createClient } from "@supabase/supabase-js";
import { downscaleToSquare } from "./image.js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const configured = Boolean(url && key && !url.includes("your-project"));

export const supabase = configured
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
  : null;

/* ---------------------------------------------------------------- auth */

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(friendly(error.message));
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(friendly(error.message));
  return data;
}

/* Clears the persisted signed-URL cache on the way out. Those URLs are
   bearer tokens — anyone holding one can fetch the file without logging
   in — so they must not survive into the next person's session on a
   shared or company device. Defined here and called below; the cache
   itself lives further down the file. */
export const signOut = async () => {
  clearSignedUrlCache();
  return supabase.auth.signOut();
};

/* Sends a password-reset email. The link it contains brings the person
   back to this same app with a Supabase recovery session already active —
   onAuthChange below fires a PASSWORD_RECOVERY event when that happens,
   which App.jsx uses to show the "choose a new password" screen instead
   of treating it as a normal sign-in.
   NOTE: whatever origin this app is actually served from (e.g.
   https://app.renla.app) must be added to Supabase → Authentication →
   URL Configuration → Redirect URLs, or the email link will fail. */
export async function requestPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin,
  });
  if (error) throw new Error(friendly(error.message));
}

/* Sets a new password once a recovery session is active (see above). */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(friendly(error.message));
}

export async function createCompany(companyName, fullName, jobTitle) {
  const { error } = await supabase.rpc("create_company_and_admin", {
    p_company_name: companyName,
    p_full_name: fullName,
    p_job_title: jobTitle || "Founder",
  });
  if (error) throw new Error(friendly(error.message));
}

export async function joinCompany(employeeId) {
  const { error } = await supabase.rpc("claim_invite", { p_token: employeeId });
  if (error) throw new Error(friendly(error.message));
}

/* Emailed invites. joinCompany() above is the older staff-code path, kept
   as the fallback for staff who have no email address — the two are
   independent and both work.

   The difference that matters: a staff code is the employee row's own
   UUID, so it never expires and anyone holding it can claim that record.
   An invite token is random, single-use, expiring, and accept_invite()
   refuses it unless the signed-in address matches the one it was sent
   to — so a forwarded invite email is useless to whoever receives it. */

export async function sendInvite({ employeeId, email, name, role }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("You've been signed out — sign in again.");
  const res = await fetch(`${url}/functions/v1/send-invite`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ employeeId, email, name, role }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Couldn't send that invite.");
  return out;   // { ok, link, error? }
}

export async function acceptInvite(token) {
  const { error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) throw new Error(friendly(error.message));
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(session, event));
  return () => data.subscription.unsubscribe();
}

export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, company_id, employee_id, full_name, role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { id: user.id, email: user.email, noCompany: true };
  return {
    id: data.id,
    email: user.email,
    companyId: data.company_id,
    employeeId: data.employee_id,
    name: data.full_name,
    role: data.role,
  };
}

function friendly(msg = "") {
  const m = msg.toLowerCase();
  if (m.includes("invalid login")) return "That email and password don't match.";
  if (m.includes("already registered")) return "That email already has an account — try signing in.";
  if (m.includes("at least 6")) return "Your password needs to be at least 6 characters.";
  if (m.includes("row-level security")) return "You don't have permission to do that.";
  if (m.includes("already belongs")) return "This account is already part of a company.";
  return msg;
}

/* --------------------------------------------------- load the workspace */

const num = (v) => Number(v) || 0;

/* attendance and presence_checks are the two tables that grow forever —
   one row per employee per working day, indefinitely. Loading a company's
   *entire* history of both on every single login/boot was fine at pilot
   scale but doesn't scale with a tenant's age: a company three years in,
   with daily attendance and mid-shift presence checks piling up the whole
   time, would see both load time and sync.js's in-memory diffing get
   slower the older the company gets, not the bigger it gets. This caps
   what's fetched at boot to a recent rolling window.

   Deliberately NOT paired with any "unload/evict old records from memory
   later in the session" logic — sync.js's diff treats a record that was
   loaded before but is missing now as "delete this from the server," so
   anything that shrinks `db.attendance`/`db.checks` after boot would look
   identical to the user deleting that history. Older data is reachable
   instead through loadAttendanceHistory() below, which is a plain read
   that never touches the synced `db` snapshot — see AttendancePage.jsx's
   History tab. */
export const ATTENDANCE_WINDOW_DAYS = 120;
const windowCutoffISO = () => {
  const d = new Date();
  d.setDate(d.getDate() - ATTENDANCE_WINDOW_DAYS);
  return d.toISOString().slice(0, 10);
};

const mapAttendanceRow = (r) => ({
  id: r.id, empId: r.employee_id, date: r.work_date, clockIn: r.clock_in || "",
  clockOut: r.clock_out || "", inLoc: r.in_location, outLoc: r.out_location,
  selfie: r.selfie_path || "", deviceId: r.device_id || "",
  deviceLabel: r.device_label || "", ip: r.ip_address || "",
  checks: r.checks || {}, status: r.status, late: r.late, reviewNote: r.review_note || "",
  note: r.note || "",
});

export async function loadWorkspace(profile) {
  const cid = profile.companyId;
  const q = (table, order) => {
    let sel = supabase.from(table).select("*").eq("company_id", cid);
    if (order) sel = sel.order(order.col, { ascending: order.asc !== false });
    return sel;
  };
  const cutoff = windowCutoffISO();

  const [company, settings, employees, pay, departments, branches, leave, permissions, checks, attendance,
         shifts, sites, devices, loans, news, docs, holidays, payruns, profiles, employeeDocs] =
    await Promise.all([
      supabase.from("companies").select("*").eq("id", cid).single(),
      supabase.from("company_settings").select("*").eq("company_id", cid).single(),
      q("employees", { col: "full_name" }),
      q("employee_pay"),
      q("departments", { col: "name" }),
    q("branches", { col: "name" }),
      q("leave_requests", { col: "applied", asc: false }),
    q("permissions", { col: "on_date", asc: false }),
    q("presence_checks", { col: "check_date", asc: false }).gte("check_date", cutoff),
      q("attendance", { col: "work_date", asc: false }).gte("work_date", cutoff),
      q("shifts"),
      q("sites"),
      q("devices"),
      q("loans", { col: "requested", asc: false }),
      q("news_posts", { col: "posted", asc: false }),
      q("documents"),
      q("holidays", { col: "holiday_date" }),
      q("payruns", { col: "month", asc: false }),
      supabase.from("profiles").select("id, employee_id, full_name, role").eq("company_id", cid),
      q("employee_documents", { col: "uploaded_at", asc: false }),
    ]);

  // Previously only 5 of these 19 queries were checked for an error — a
  // failed load of e.g. employee_pay, loans, or shifts was indistinguishable
  // from "this company genuinely has none of those rows" (every mapper
  // below defaults a failed/empty query the same way), so it would render
  // as a normal-looking, quietly-wrong workspace instead of an error. Worst
  // case was employee_pay: a failed fetch there zeroes every employee's pay
  // fields with no signal to HR that anything went wrong.
  const failed = [company, settings, employees, pay, departments, branches, leave, permissions, checks,
    attendance, shifts, sites, devices, loans, news, docs, holidays, payruns, profiles, employeeDocs].find((r) => r.error);
  if (failed) throw failed.error;

  const payById = Object.fromEntries((pay.data || []).map((p) => [p.employee_id, p]));

  return {
    company: {
      id: company.data.id, name: company.data.name,
      address: company.data.address || "", country: company.data.country || "Nigeria",
    },
    work: settings.data.work,
    payroll: settings.data.payroll,
    onboarding: settings.data.onboarding || {},
    leaderboard: settings.data.leaderboard || {},
    employees: (employees.data || []).map((r) => {
      const p = payById[r.id];
      return {
        id: r.id, name: r.full_name, email: r.email || "", phone: r.phone || "",
        dob: r.dob || "", gender: r.gender || "", marital: r.marital || "",
        area: r.area || "", title: r.job_title || "", dept: r.department || "",
        managerId: r.manager_id || "", joined: r.joined || "",
        contract: r.contract || "Full-time", status: r.status || "Active",
        kin: r.next_of_kin || "", emergency: r.emergency || "",
        referenceName: r.reference_name || "", referencePhone: r.reference_phone || "",
        referenceRelationship: r.reference_relationship || "", avatarPath: r.avatar_path || "",
        profileLocked: Boolean(r.profile_locked),
        bal: r.balances || { annual: 20, sick: 10, comp: 5 },
        checkPrefs: r.check_prefs || {},
        branchId: r.branch_id || "", shiftId: r.shift_id || "", contractEnd: r.contract_end || "",
        weekSchedule: r.week_schedule || null, scheduleMode: r.schedule_mode || "",
        nin: p?.nin || "", bvn: p?.bvn || "", tin: p?.tin || "",
        pension: p?.rsa_pin || "", bank: p?.bank || "",
        acctName: p?.account_name || "", acct: p?.account_number || "",
        hasPay: Boolean(p),
        pay: {
          basic: num(p?.basic), transport: num(p?.transport), bonus: num(p?.bonus),
          holiday: num(p?.holiday_pay), sunday: num(p?.sunday_pay),
          other: num(p?.other_allowance), annualRent: num(p?.annual_rent),
          pensionRate: p?.pension_rate == null ? null : Number(p.pension_rate),
          nhis: num(p?.nhis), lifeIns: num(p?.life_insurance),
          mortgage: num(p?.mortgage), otherAllowable: num(p?.other_allowable),
        },
      };
    }),
    departments: (departments.data || []).map((d) => d.name),
    branches: (branches.data || []).map((b) => ({
      id: b.id, name: b.name, address: b.address || "",
      weekSchedule: b.week_schedule || null,
      useCompanySchedule: b.use_company_schedule !== false,
    })),
    checks: (checks.data || []).map((r) => ({
      id: r.id, empId: r.employee_id, date: r.check_date, dueTime: r.due_time,
      answeredAt: r.answered_at || "", status: r.status, loc: r.location,
      selfie: r.selfie_path || "", minutesLate: r.minutes_late || 0, note: r.note || "",
    })),
    permissions: (permissions.data || []).map((r) => ({
      id: r.id, empId: r.employee_id, kind: r.kind, category: r.category, date: r.on_date,
      fromTime: r.from_time || "", toTime: r.to_time || "", reason: r.reason || "",
      area: r.area || "", loc: r.location, capturedAt: (r.location && r.location.capturedAt) || "",
      status: r.status, applied: r.applied,
    })),
    leave: (leave.data || []).map((r) => ({
      id: r.id, empId: r.employee_id, type: r.leave_type, from: r.from_date,
      to: r.to_date, days: r.days, reason: r.reason || "", status: r.status, applied: r.applied,
    })),
    attendance: (attendance.data || []).map(mapAttendanceRow),
    shifts: (shifts.data || []).map((s) => ({
      id: s.id, empId: s.employee_id, date: s.shift_date,
      start: s.start_time, end: s.end_time, note: s.note || "",
    })),
    sites: (sites.data || []).map((s) => ({
      id: s.id, name: s.name, lat: s.lat, lng: s.lng, radius: s.radius,
    })),
    devices: (devices.data || []).map((d) => ({
      id: d.id, empId: d.employee_id, deviceId: d.device_id, label: d.label || "",
      status: d.status, requested: d.requested, approved: d.approved || "",
    })),
    loans: (loans.data || []).map((l) => ({
      id: l.id, empId: l.employee_id, type: l.loan_type, amount: num(l.amount),
      months: l.months, monthly: num(l.monthly), reason: l.reason || "",
      status: l.status, repaid: num(l.repaid), requested: l.requested, approved: l.approved || "",
    })),
    news: (news.data || []).map((n) => ({
      id: n.id, authorId: n.author_id || "", author: n.author_name || "",
      role: n.author_role || "", title: n.title, body: n.body || "",
      category: n.category, pinned: n.pinned, likes: n.likes || 0, date: n.posted,
    })),
    docs: (docs.data || []).map((d) => ({
      id: d.id, name: d.name, cat: d.category, ver: d.version,
      filePath: d.file_path || "", link: d.link || "", hrOnly: d.hr_only, updated: d.updated,
    })),
    holidays: (holidays.data || []).map((h) => ({ id: h.id, name: h.name, date: h.holiday_date })),
    payruns: (payruns.data || []).map((r) => ({
      id: r.id, month: r.month, status: r.status, lines: r.lines || [], created: r.created_at,
    })),
    users: (profiles.data || []).map((p) => ({
      id: p.id, employeeId: p.employee_id, name: p.full_name, role: p.role,
    })),
    employeeDocs: (employeeDocs.data || []).map((d) => ({
      id: d.id, empId: d.employee_id, kind: d.kind, name: d.name,
      filePath: d.file_path, uploaded: d.uploaded_at,
    })),
  };
}

/* Reads one month of attendance history directly from Supabase, for a
   month older than the rolling window loadWorkspace() keeps in memory
   (see ATTENDANCE_WINDOW_DAYS above). This is a plain, read-only query —
   its result is never merged into the app's `db` state or passed to
   syncChanges, so it can't ever be mistaken for a deletion the way
   widening/narrowing the synced snapshot would be. Used by
   AttendancePage.jsx's History tab when someone picks an older month. */
export async function loadAttendanceHistory(companyId, { empId, month } = {}) {
  const from = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const to = new Date(y, m, 0).toISOString().slice(0, 10); // last day of that month
  let sel = supabase.from("attendance").select("*")
    .eq("company_id", companyId)
    .gte("work_date", from)
    .lte("work_date", to)
    .order("work_date", { ascending: false });
  if (empId && empId !== "all") sel = sel.eq("employee_id", empId);
  const { data, error } = await sel;
  if (error) throw error;
  return (data || []).map(mapAttendanceRow);
}

/* ------------------------------------------------------------- storage */

export async function uploadSelfie(dataUrl, companyId, employeeId, date) {
  const blob = await (await fetch(dataUrl)).blob();
  const path = `${companyId}/${employeeId}/${date}-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("selfies")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

/* Actually removes selfie photos from storage — not just clearing the
   database column that points at them. Previously pruneSelfies() (see
   presence.js) only ever cleared the `selfie` field on an old attendance
   record, which meant the underlying image blob stayed in the "selfies"
   bucket forever: an unbounded, unreferenced pile of employee face photos
   accumulating storage cost and outliving the 90-day retention the app's
   own pruning logic implies. sync.js calls this whenever it detects a
   selfie path was cleared (pruned) or its record was deleted. */
export async function deleteSelfies(paths) {
  return supabase.storage.from("selfies").remove(paths);
}

export async function uploadDocument(file, companyId) {
  const safe = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${companyId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("documents").upload(path, file);
  if (error) throw error;
  return path;
}

/* Profile picture. Anyone in the company can upload their own (see the
   avatars_write storage policy in catch-up-migration-6.sql) — HR can set
   one for someone else too. */
export async function uploadAvatar(dataUrl, companyId, employeeId) {
  // Downscale before upload, not after. Renla never renders an avatar
  // above 72px, so storing the phone's original 4MB shot means paying to
  // send it again on every directory row, leaderboard entry and birthday
  // card that shows that face.
  const small = await downscaleToSquare(dataUrl, 320);
  const blob = await (await fetch(small)).blob();
  const path = `${companyId}/${employeeId}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { contentType: "image/jpeg", upsert: true });
  if (error) throw error;
  return path;
}

export async function removeFiles(bucket, paths) {
  if (!paths || !paths.length) return { error: null };
  return supabase.storage.from(bucket).remove(paths);
}

/* KYC/ID/reference-letter uploads for the self-service onboarding
   profile — a plain browser File this time (a document, not a captured
   photo), unlike uploadSelfie/uploadAvatar which take a data URL. */
export async function uploadEmployeeDocument(file, companyId, employeeId) {
  const safe = file.name.replace(/[^\w.\-]/g, "_");
  const path = `${companyId}/${employeeId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("employee-docs").upload(path, file);
  if (error) throw error;
  return path;
}

/* Signed URLs, cached in memory AND across page loads.
   
   A signed URL carries a one-off token, so minting a new one for the same
   file produces a different URL — which the browser and the CDN both treat
   as a brand new object and download again from scratch. The in-memory Map
   alone died on every refresh, so every boot re-downloaded every avatar and
   document already sitting in the browser's own HTTP cache. Persisting the
   URL string means the same URL comes back, and the cached bytes get used.

   Only the URL is stored, never file contents, and each entry carries its
   own expiry so a stale token is never handed out. */
const URL_CACHE_KEY = "renla.signedUrls";
const urlCache = new Map();

try {
  const saved = JSON.parse(localStorage.getItem(URL_CACHE_KEY) || "{}");
  const now = Date.now();
  Object.entries(saved).forEach(([k, v]) => {
    if (v && v.expires > now) urlCache.set(k, v);
  });
} catch { /* unreadable or private mode — start empty, nothing breaks */ }

export function clearSignedUrlCache() {
  urlCache.clear();
  try { localStorage.removeItem(URL_CACHE_KEY); } catch { /* nothing to clear */ }
}

let persistTimer = null;
function persistUrlCache() {
  // Debounced: a directory render can resolve thirty avatars at once and
  // there is no sense serialising the map thirty times.
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      const now = Date.now();
      const out = {};
      urlCache.forEach((v, k) => { if (v.expires > now) out[k] = v; });
      localStorage.setItem(URL_CACHE_KEY, JSON.stringify(out));
    } catch { /* quota or private mode — the in-memory cache still works */ }
  }, 400);
}

// 8 hours rather than 1: covers a full working day, so someone who opens
// Renla in the morning isn't re-downloading the same faces after lunch.
export async function signedUrl(bucket, path, seconds = 28800) {
  if (!path) return "";
  const cacheKey = bucket + "|" + path;
  const hit = urlCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return hit.url;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error || !data) return "";
  urlCache.set(cacheKey, { url: data.signedUrl, expires: Date.now() + (seconds - 60) * 1000 });
  persistUrlCache();
  return data.signedUrl;
}
