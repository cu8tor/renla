import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  supabase, configured, signIn as sbSignIn, signUp as sbSignUp, signOut as sbSignOut,
  createCompany, joinCompany, getProfile, onAuthChange,
  loadWorkspace, uploadDocument, signedUrl,
  uploadAvatar, uploadEmployeeDocument, removeFiles,
} from "./lib/supabase.js";
import { onboardingChecklist } from "./lib/onboarding.js";
import { syncChanges } from "./lib/sync.js";
import {
  LayoutDashboard, Users, CalendarDays, Newspaper, FolderClosed, Clock3,
  CalendarRange, Wallet, BarChart3, Search, Sun, Moon, Plus, Check, X,
  ChevronRight, LogOut, Cake, Briefcase, Building2, Phone, Mail, MapPin,
  ShieldCheck, Download, Pin, Heart, FileText, ArrowRight, Menu,
  PartyPopper, Users2, Lock, Landmark, CreditCard, BadgeCheck,
  Settings as SettingsIcon, Trash2, Pencil, KeyRound, Database, AlertCircle,
  UserPlus, Link2, Info, Play, Square, Timer, ChevronLeft, Copy, AlertTriangle,
  Camera, Smartphone, Wifi, ShieldAlert, RefreshCw, CheckCircle2, XCircle, Eye,
  Receipt, Banknote,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
  PieChart, Pie,
} from "recharts";
import {
  NTA2025_BANDS, DEFAULT_PAYROLL, calendarWorkingDays, resolveWorkingDays,
  amountInWords, emptyPay, payeAnnual, computePayslip,
  personalOutMinutes, excusedLateDatesFor, excursionDatesFor,
} from "./features/payroll/payrollEngine.js";
import {
  DAYS, pad2, nowHM, hmToMin, minToHM, durLabel, addDays, mondayOf, shiftMins,
  DEFAULT_SHIFTS, crossesMidnight, minutesBetween, shiftFor, lateMinutesAgainst,
  overtimeMinutes, CHECK_KEYS, effectiveWork, anyoneHas, hasOverrides,
} from "./features/attendance/attendanceLogic.js";
import {
  nextLeaveStatus, shouldDecrementBalance, decrementLeaveBalance, validateLeaveDates,
} from "./features/leave/leaveLogic.js";

import { LIGHT, DARK } from "./theme.js";
import { getLocalDevice } from "./lib/device.js";
import { savePendingAttendance, mergePendingAttendance } from "./lib/offlineQueue.js";
import { uid, parseD, iso, todayISO, startOfToday, daysInclusive, nextBirthday } from "./lib/format.js";
import { distLabel, getPosition, locErrLabel, stampLocation } from "./lib/geo.js";
import { fetchIP, evaluateChecks, CHECK_LABEL, pruneSelfies } from "./lib/presence.js";
import { isOnLeaveToday } from "./features/insights/monthInsights.js";
import { monthLabel, normalizeDb } from "./lib/payrollHelpers.js";
import { Avatar, EmpAvatar, Card, Btn } from "./components/ui.jsx";
import { ErrorBoundary } from "./components/ErrorBoundary.jsx";
import { StyleTag } from "./components/StyleTag.jsx";
import { NotConfigured, AuthScreen, NewCompany, ResetPasswordScreen } from "./pages/AuthPages.jsx";
import renlaLogoWhite from "./assets/renla-logo-white.png";
import { DashboardPage } from "./pages/DashboardPage.jsx";
import { EmployeesPage } from "./pages/EmployeesPage.jsx";
import { LeavePage } from "./pages/LeavePage.jsx";
import { NewsPage } from "./pages/NewsPage.jsx";
import { DocsPage } from "./pages/DocsPage.jsx";
import { SettingsPage } from "./pages/SettingsPage.jsx";
import { AttendancePage } from "./pages/AttendancePage.jsx";
import { RotaPage } from "./pages/RotaPage.jsx";
import { PayrollPage } from "./pages/PayrollPage.jsx";
import { SoonPage } from "./pages/SoonPage.jsx";
import { ProfilePage } from "./pages/ProfilePage.jsx";
/* ================================================================== */
/*  APP                                                                */
/* ================================================================== */
/* Thin wrapper so AppShell (everything the app actually does) can freely
   use useNavigate()/useLocation() — those hooks only work in a component
   that renders BELOW a Router in the tree, not in the component that
   renders the Router itself. Keeping the Router here means App.jsx stays
   fully self-contained; nothing about the real project's main.jsx/entry
   point needs to change. */
export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

function AppShell() {
  const [dark, setDark] = useState(false);
  const [booted, setBooted] = useState(false);
  const [db, setDb] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();
  // The page in view, derived from the URL instead of separate React state —
  // "/employees" -> "employees", "/" -> "dashboard" (the default landing page).
  const view = location.pathname.split("/")[1] || "dashboard";
  const [navOpen, setNavOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [search, setSearch] = useState("");
  const [saveError, setSaveError] = useState(false);
  const [pendingSync, setPendingSync] = useState(false); // local changes exist that Supabase hasn't confirmed yet
  const [locating, setLocating] = useState(false);
  const [localDevice, setLocalDevice] = useState(null);
  const [profile, setProfile] = useState(null);      // signed-in user + role
  const [authReady, setAuthReady] = useState(false);
  const [recovery, setRecovery] = useState(false);   // came in via a password-reset link
  const [authLinkError, setAuthLinkError] = useState("");  // an expired/already-used reset link
  const [loadError, setLoadError] = useState("");
  const dbRef = useRef(null);
  const syncing = useRef(false);
  const lastSyncedRef = useRef(null);  // last snapshot successfully written to Supabase
  const profileRef = useRef(null);
  useEffect(() => { profileRef.current = profile; }, [profile]);

  const theme = dark ? DARK : LIGHT;

  const toast = useCallback((msg, tone = "ok", ms = 3200) => {
    const id = uid("t");
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), ms);
  }, []);

  /* ---------- boot: watch the session, then load the workspace ---------- */
  useEffect(() => { setLocalDevice(getLocalDevice()); }, []);

  useEffect(() => {
    if (!configured) { setAuthReady(true); setBooted(true); return; }
    let alive = true;

    // An expired or already-used password-reset link fails inside Supabase's
    // own client-side URL handling before it ever reaches onAuthChange below
    // — no PASSWORD_RECOVERY event fires, no error is thrown anywhere this
    // app's code runs, and the person is just quietly left on the plain
    // sign-in screen with a dead token still sitting in the URL, no
    // indication anything happened. Supabase does append an error to the
    // URL fragment in that case, so surface it here instead.
    if (window.location.hash.includes("error=")) {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const desc = params.get("error_description");
      setAuthLinkError(desc ? desc.replace(/\+/g, " ") : "That link didn't work — it may have expired or already been used.");
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }

    const refresh = async () => {
      try {
        const p = await getProfile();
        if (!alive) return;
        setProfile(p);
        if (p && !p.noCompany) {
          const ws = await loadWorkspace(p);
          if (!alive) return;
          const n = normalizeDb(ws);
          // The server's copy is the sync baseline...
          lastSyncedRef.current = n;
          // ...but if a clock-in/out from this device never made it to
          // Supabase before the app was closed or reloaded (see
          // offlineQueue.js), it's still sitting in localStorage — bring
          // it back into local state now so it isn't lost, and so the
          // dbRef/lastSyncedRef mismatch this creates gets picked up by
          // the "resume any pending sync" effect below and retried.
          const merged = mergePendingAttendance(n, p.companyId, p.employeeId);
          dbRef.current = merged;
          setDb(merged);
        } else {
          dbRef.current = null;
          lastSyncedRef.current = null;
          setDb(null);
        }
      } catch (e) {
        if (alive) setLoadError(e.message || "Couldn't load your workspace.");
      } finally {
        if (alive) { setAuthReady(true); setBooted(true); }
      }
    };

    refresh();
    const off = onAuthChange((session, event) => {
      // A password-reset link lands here as a real sign-in (Supabase opens a
      // session for it), so without this check the person would land straight
      // in the dashboard instead of being asked to choose a new password.
      if (event === "PASSWORD_RECOVERY") { setRecovery(true); return; }
      // USER_UPDATED (e.g. saving a new password) and TOKEN_REFRESHED (the
      // background session-token renewal Supabase does automatically, and
      // which it also re-fires when the tab regains focus/reconnects) are
      // pure session bookkeeping — nothing about who's signed in or what
      // data should be loaded actually changed. Reacting to them here would
      // force the app back through the full "Opening Renla…" loader, which
      // unmounts whatever's on screen and wipes any in-progress form —
      // this is why the "Add employee" / "New company" setup screens (and
      // the password-reset confirmation) could appear to randomly clear or
      // "time out" mid-entry: a routine token refresh was silently
      // remounting the page underneath the person typing.
      // INITIAL_SESSION fires once, unconditionally, the moment this
      // listener is registered — on top of the direct refresh() call two
      // lines above that already covers exactly this case. Left unfiltered,
      // it triggers a second, redundant loadWorkspace() on every single
      // boot that finishes after the first render, forcing the same
      // "Opening Renla…" reload-and-remount over whatever the person has
      // already navigated into.
      if (event === "USER_UPDATED" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      // SIGNED_IN also gets re-emitted by Supabase for an already-active
      // session (same tab-focus/reconnect situation above) — only treat it
      // as a real sign-in if it's actually a different account than the one
      // already loaded.
      if (event === "SIGNED_IN" && profileRef.current && session?.user?.id === profileRef.current.id) return;
      setBooted(false);
      refresh();
    });
    return () => { alive = false; off(); };
  }, []);

  const reload = useCallback(async () => {
    if (!profile || profile.noCompany) return;
    try {
      const ws = normalizeDb(await loadWorkspace(profile));
      lastSyncedRef.current = ws;
      dbRef.current = mergePendingAttendance(ws, profile.companyId, profile.employeeId);
      setDb(dbRef.current);
    } catch (e) { toast(e.message || "Couldn't refresh", "danger"); }
  }, [profile]);

  /* ---------- persistence: change the state, then save what changed ----------
     runSync() always diffs from lastSyncedRef (the last snapshot actually
     confirmed written) to dbRef.current (the latest local state), and — if
     a sync is already in flight when it's called — simply returns, relying
     on the in-flight sync's own .finally() to notice more has piled up and
     call itself again. Previously `update()` diffed from whatever
     `before`/`dbRef.current` happened to be at that exact call, and if a
     sync was already running it skipped syncChanges entirely for that
     call — not queued, not retried, just silently never sent, since the
     next call's diff would be computed against the now-already-advanced
     dbRef.current and so would never see that older change again either.
     Two clicks close together (e.g. approving two leave requests within
     the same round trip) could permanently lose the second one with no
     error shown. This version can't drop a change that way: whatever
     hasn't reached lastSyncedRef yet always gets picked up by the next
     sync pass, either immediately or right after the current one finishes. */
  // Mirrors the current employee's not-yet-confirmed attendance rows to
  // localStorage (see offlineQueue.js) and updates the header's pending-
  // sync indicator. Called right after every local write and again once
  // a sync attempt resolves, so both survive a reload and stay visible
  // while offline. Reads refs directly rather than closing over `db`/
  // `profile` state so it's always accurate regardless of when it's
  // called from.
  const syncPendingCache = () => {
    const emp = profileRef.current?.employeeId;
    const cid = profileRef.current?.companyId;
    const cur = dbRef.current;
    const synced = lastSyncedRef.current;
    if (!emp || !cid || !cur) { setPendingSync(false); return; }
    const mine = (arr) => (arr || []).filter((a) => a.empId === emp);
    const curRows = mine(cur.attendance);
    const syncedRows = mine(synced?.attendance);
    const pendingRows = curRows.filter((a) => {
      const s = syncedRows.find((x) => x.id === a.id);
      return !s || JSON.stringify(s) !== JSON.stringify(a);
    });
    savePendingAttendance(cid, emp, pendingRows);
    setPendingSync(pendingRows.length > 0);
  };

  const runSync = useCallback(() => {
    if (!configured || !profile?.companyId || syncing.current) return;
    const from = lastSyncedRef.current;
    const to = dbRef.current;
    if (!from || !to || from === to) return; // nothing new to send
    syncing.current = true;
    syncChanges(from, to, profile.companyId)
      .then(({ patches, errors }) => {
        // Whatever we just attempted is now the baseline for the next diff,
        // whether or not every row in it succeeded — see the errors branch
        // below for why rows that failed still need a human to notice.
        lastSyncedRef.current = to;
        if (patches.length) {
          setDb((d) => {
            if (!d) return d;
            let out = d;
            patches.forEach((p) => {
              out = { ...out, [p.collection]: out[p.collection].map((x) => (x.id === p.id ? { ...x, ...p.changes } : x)) };
            });
            dbRef.current = out;
            lastSyncedRef.current = out;
            return out;
          });
        }
        if (errors.length) {
          setSaveError(true);
          // Every failed write, not just the first — a batch that touches
          // several records (e.g. bulk edits) used to report only one
          // error and stay silent about the rest.
          toast(errors.length === 1 ? errors[0] : `${errors.length} changes didn't save: ${errors.join("; ")}`, "danger", errors.length > 1 ? 9000 : 3200);
        } else {
          setSaveError(false);
        }
        syncPendingCache();
      })
      .catch((e) => { setSaveError(true); toast(e.message || "Couldn't save", "danger"); syncPendingCache(); })
      .finally(() => {
        syncing.current = false;
        // More local changes may have landed while this sync was running —
        // send them now instead of waiting for the next unrelated update().
        if (dbRef.current !== lastSyncedRef.current) runSync();
      });
  }, [profile, toast]);

  const update = useCallback((fn) => {
    // Read/write dbRef.current directly rather than via setDb's functional-
    // updater form, so runSync() below (which reads dbRef.current) is
    // guaranteed to see this change immediately rather than depending on
    // exactly when React chooses to invoke the updater callback.
    const cur = dbRef.current;
    if (!cur) return;
    if (lastSyncedRef.current == null) lastSyncedRef.current = cur;
    let next = fn(cur);
    // Clear selfie photos older than 90 days on every update — not just on
    // clock-in — so retention is enforced reliably regardless of which
    // action happens to run next; this also covers presence-check photos,
    // which previously were never pruned at all. Clearing the field here is
    // only half of it — syncChanges (sync.js) is what actually deletes the
    // underlying file from storage once it sees the change.
    next = { ...next, attendance: pruneSelfies(next.attendance), checks: pruneSelfies(next.checks) };
    dbRef.current = next;
    setDb(next);
    syncPendingCache();
    runSync();
  }, [runSync]);

  // Picks back up any sync left outstanding after boot merges in a
  // pending clock-in from a previous offline session (see refresh()
  // above) — without this, a change that arrived via the cache rather
  // than a live update() call would just sit there until something
  // unrelated happened to trigger a sync.
  useEffect(() => {
    if (dbRef.current && lastSyncedRef.current && dbRef.current !== lastSyncedRef.current) runSync();
  }, [db, runSync]);

  // Retries whenever the browser thinks connectivity is back, or the tab
  // regains focus (a phone waking back up doesn't always fire "online"
  // reliably) — otherwise an offline clock-in only syncs once the person
  // happens to make some other change.
  useEffect(() => {
    window.addEventListener("online", runSync);
    window.addEventListener("focus", runSync);
    return () => { window.removeEventListener("online", runSync); window.removeEventListener("focus", runSync); };
  }, [runSync]);

  /* ---------- derived ---------- */
  const me = db && profile && !profile.noCompany ? { id: profile.id, name: profile.name, role: profile.role, employeeId: profile.employeeId } : null;
  const myEmp = me && db ? db.employees.find((e) => e.id === me.employeeId) : null;
  const isHR = me?.role === "HR Admin";
  const isManager = me?.role === "Manager";
  const empById = useCallback((id) => db?.employees.find((e) => e.id === id), [db]);
  const myTeam = useMemo(() => (db && myEmp ? db.employees.filter((e) => e.managerId === myEmp.id) : []), [db, myEmp]);

  /* ================================================================ */
  /*  BOOT / ONBOARDING                                                */
  /* ================================================================ */
  if (!configured) return <NotConfigured theme={theme} />;

  if (!authReady || (profile && !profile.noCompany && !booted)) {
    return (
      <div style={{ ...theme, fontFamily: "var(--font-body)", background: "var(--paper)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <StyleTag />
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13.5 }}>
          <div className="cp-spin" /><div style={{ marginTop: 14 }}>Opening Renla…</div>
        </div>
      </div>
    );
  }

  if (recovery) return <ResetPasswordScreen theme={theme} dark={dark} setDark={setDark} onDone={() => setRecovery(false)} />;

  if (!profile) return <AuthScreen theme={theme} dark={dark} setDark={setDark} linkError={authLinkError} />;
  if (profile.noCompany) return <NewCompany theme={theme} dark={dark} setDark={setDark} profile={profile} />;

  if (loadError) {
    return (
      <div style={{ ...theme, fontFamily: "var(--font-body)", background: "var(--paper)", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <StyleTag />
        <Card style={{ maxWidth: 420, textAlign: "center" }}>
          <AlertTriangle size={26} style={{ color: "var(--danger)" }} />
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, margin: "12px 0 8px" }}>Couldn't load your workspace</h3>
          <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6 }}>{loadError}</p>
          <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center" }}>
            <Btn onClick={() => window.location.reload()}>Try again</Btn>
            <Btn variant="ghost" onClick={() => sbSignOut()}>Sign out</Btn>
          </div>
        </Card>
      </div>
    );
  }

  if (!db || !me) return null;

  /* ================================================================ */
  /*  ACTIONS                                                          */
  /* ================================================================ */
  const logout = async () => { setNavOpen(false); dbRef.current = null; lastSyncedRef.current = null; setDb(null); setProfile(null); await sbSignOut(); };

  const saveEmployee = (emp, isNew) => {
    update((d) => ({
      ...d,
      employees: isNew ? [...d.employees, emp] : d.employees.map((e) => (e.id === emp.id ? emp : e)),
      departments: emp.dept && !d.departments.includes(emp.dept) ? [...d.departments, emp.dept] : d.departments,
    }));
    toast(isNew ? "Employee added" : "Changes saved");
  };

  // HR freezing an employee's own edit access — added on request, so bank/
  // KYC/contact details can be verified once and then not change again
  // without HR knowing. `guard_employee_self_edit`/`guard_pay_self_edit`
  // (catch-up-migration-7.sql) reject every self-write while this is on,
  // including document/photo uploads via the matching storage policies —
  // this toggle is HR-only both here (isHR gates the button in
  // EmployeesPage) and at the database level (profile_locked is one of the
  // columns those triggers block a non-HR account from ever changing).
  const setEmployeeLock = (id, locked) => {
    const emp = db.employees.find((e) => e.id === id);
    update((d) => ({ ...d, employees: d.employees.map((e) => (e.id === id ? { ...e, profileLocked: locked } : e)) }));
    toast(locked
      ? `${emp?.name?.split(" ")[0] || "Their"} profile is locked — they can no longer edit their own details`
      : `${emp?.name?.split(" ")[0] || "Their"} profile is unlocked again`);
  };

  const deleteEmployee = (id) => {
    update((d) => ({
      ...d,
      employees: d.employees.filter((e) => e.id !== id).map((e) => (e.managerId === id ? { ...e, managerId: "" } : e)),
      leave: d.leave.filter((l) => l.empId !== id),
      users: d.users.filter((u) => u.employeeId !== id),
      // Device registrations have no value once the employee is gone — they
      // were previously left behind, showing up in Settings → Registered
      // devices as "Unknown" with no way to identify or bulk-clean them.
      // (Attendance, leave-balance history, loans, and payrun lines are
      // deliberately NOT cleaned up here — deleteEmployee is for correcting
      // a mistaken entry, not offboarding; a real departure uses the
      // "Exited" status instead and keeps its records, which payroll/audit
      // history should retain regardless.)
      devices: d.devices.filter((x) => x.empId !== id),
    }));
    toast("Employee removed", "danger");
  };

  /* ---------- self-service profile — the employee filling in their OWN
     details (personal info, emergency contact, reference, bank/KYC,
     documents, profile picture), instead of HR typing everything in for
     every new hire. `patch` here is only ever the non-HR-owned fields —
     ProfilePage.jsx builds it from that limited set — and the database
     backs this up independently (catch-up-migration-6.sql's
     guard_employee_self_edit/guard_pay_self_edit triggers reject any
     write to job/schedule/status/pay fields from a non-HR account, so
     this is defense in depth, not the only thing stopping it. */
  const saveMyProfile = (patch) => {
    if (!myEmp) { toast("Your login isn't linked to an employee record", "warn"); return; }
    if (myEmp.profileLocked) { toast("Your profile is locked by HR — contact HR to make changes", "warn"); return; }
    update((d) => ({ ...d, employees: d.employees.map((e) => (e.id === myEmp.id ? { ...e, ...patch } : e)) }));
    toast("Profile saved");
  };

  const uploadMyAvatar = async (dataUrl) => {
    if (!myEmp) return;
    if (myEmp.profileLocked) { toast("Your profile is locked by HR — contact HR to make changes", "warn"); return; }
    try {
      const path = await uploadAvatar(dataUrl, profile.companyId, myEmp.id);
      update((d) => ({ ...d, employees: d.employees.map((e) => (e.id === myEmp.id ? { ...e, avatarPath: path } : e)) }));
      toast("Profile picture updated");
    } catch (e) { toast(e.message || "Couldn't upload that photo", "danger"); }
  };

  const uploadMyDocument = async (file, kind, name) => {
    if (!myEmp) return;
    if (myEmp.profileLocked) { toast("Your profile is locked by HR — contact HR to make changes", "warn"); return; }
    try {
      const path = await uploadEmployeeDocument(file, profile.companyId, myEmp.id);
      update((d) => ({ ...d, employeeDocs: [{ id: uid("edoc"), empId: myEmp.id, kind, name: name || file.name, filePath: path, uploaded: todayISO() }, ...d.employeeDocs] }));
      toast("Document uploaded");
    } catch (e) { toast(e.message || "Couldn't upload that file", "danger"); }
  };

  const deleteMyDocument = (docId) => {
    if (!myEmp) return;
    if (myEmp.profileLocked) { toast("Your profile is locked by HR — contact HR to make changes", "warn"); return; }
    update((d) => ({ ...d, employeeDocs: d.employeeDocs.filter((x) => x.id !== docId) }));
    toast("Document removed", "danger");
  };

  const saveOnboardingRequirements = (patch) => {
    update((d) => ({ ...d, onboarding: { ...d.onboarding, ...patch } }));
  };

  const applyLeave = (form) => {
    if (!myEmp) { toast("Your login isn't linked to an employee record", "warn"); return false; }
    const validation = validateLeaveDates(form.from, form.to, parseD, db.leave.filter((l) => l.empId === myEmp.id));
    if (!validation.ok) { toast(validation.error, "warn"); return false; }
    const days = daysInclusive(form.from, form.to);
    const status = myEmp.managerId ? "pending_manager" : "pending_hr";
    update((d) => ({ ...d, leave: [{ id: uid("lv"), empId: myEmp.id, type: form.type, from: form.from, to: form.to, days, reason: form.reason || "—", status, applied: todayISO() }, ...d.leave] }));
    toast("Request submitted for approval");
    return true;
  };

  const decideLeave = (id, approve) => {
    // A Manager may only decide their own direct reports' requests, at the
    // manager stage — HR can decide any, at either stage. The Leave page's
    // UI already hides the button for out-of-team requests; this repeats
    // the check here so the function itself can't be called on someone
    // outside the manager's team regardless of how it's invoked.
    const target = db.leave.find((x) => x.id === id);
    if (!isHR) {
      if (!target || target.status !== "pending_manager" || !myTeam.some((m) => m.id === target.empId)) {
        toast("You can only decide requests from your own team", "danger"); return;
      }
    }
    update((d) => {
      let employees = d.employees;
      const leave = d.leave.map((l) => {
        if (l.id !== id) return l;
        // A manager passes it up to HR. HR has the final say at either stage,
        // so when HR approves, it's done — no second click needed.
        const next = nextLeaveStatus(l.status, approve, isHR);
        if (shouldDecrementBalance(l.status, next)) {
          employees = employees.map((e) => (e.id === l.empId ? decrementLeaveBalance(e, l.type, l.days) : e));
        }
        return { ...l, status: next };
      });
      return { ...d, leave, employees };
    });
    const l = db.leave.find((x) => x.id === id);
    if (!approve) toast("Request declined", "danger");
    else if (l?.status === "pending_manager" && !isHR) toast("Approved — sent to HR for final sign-off");
    else toast("Leave approved · balance updated");
  };

  const publishPost = (form) => {
    if (!form.title.trim()) { toast("Give the update a title", "warn"); return false; }
    update((d) => ({ ...d, news: [{ id: uid("nw"), authorId: myEmp?.id || "", author: me.name, role: myEmp?.title || me.role, date: todayISO(), category: form.category, pinned: false, title: form.title, body: form.body, likes: 0, liked: false }, ...d.news] }));
    toast("Update published");
    return true;
  };
  const toggleLike = (id) => update((d) => ({ ...d, news: d.news.map((p) => (p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p)) }));
  const togglePin = (id) => update((d) => ({ ...d, news: d.news.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p)) }));
  const deletePost = (id) => { update((d) => ({ ...d, news: d.news.filter((p) => p.id !== id) })); toast("Update deleted", "danger"); };

  const addDoc = (form) => {
    if (!form.name.trim()) { toast("Give the document a name", "warn"); return false; }
    update((d) => ({ ...d, docs: [...d.docs, { id: uid("dc"), name: form.name, cat: form.cat || "General", ver: form.ver || "v1.0", updated: todayISO(), hrOnly: form.hrOnly, link: form.link || "", filePath: form.filePath || "" }] }));
    toast("Document added");
    return true;
  };
  const deleteDoc = (id) => { update((d) => ({ ...d, docs: d.docs.filter((x) => x.id !== id) })); toast("Document removed", "danger"); };

  const resetAll = async () => {
    toast("Your data lives in Supabase now — delete records from within the app", "warn");
  };


  /* ---- Phase 2: attendance ---- */
  const myTodayAtt = myEmp ? db.attendance.find((a) => a.empId === myEmp.id && a.date === todayISO()) : null;

  const myDeviceRecord = myEmp && localDevice ? db.devices.find((x) => x.empId === myEmp.id && x.deviceId === localDevice.id) : null;
  const myDeviceOk = !!(myDeviceRecord && myDeviceRecord.status === "active");

  /* runs the full check set, then writes the record */
  const performClockIn = async ({ selfie }) => {
    if (!myEmp) { toast("Your login isn't linked to an employee record", "warn"); return false; }
    if (myTodayAtt && myTodayAtt.clockIn) { toast("You're already clocked in today", "warn"); return false; }

    const myWork = effectiveWork(db.work, myEmp);
    let loc = null, ip = null;
    if (myWork.requireLocation) {
      const pos = await getPosition();
      loc = stampLocation(db.sites, pos);
      if (myWork.blockOffsite && (loc.error || (db.sites.length && !loc.inside))) {
        toast(loc.error ? `${locErrLabel(loc.error)} — can't clock in` : `You're ${distLabel(loc.dist)} from ${loc.siteName} — too far to clock in`, "danger");
        return false;
      }
    }
    if (myWork.recordIP) ip = await fetchIP();

    const { checks, failed, status } = evaluateChecks({ work: myWork, sites: db.sites, loc, deviceOk: myDeviceOk, selfie, ip });
    const t = nowHM();
    // Against this employee's actual shift for today — not the company's flat
    // dayStart — so night-shift/branch/custom-hours staff aren't flagged late
    // just for clocking in on time against a shift that isn't theirs.
    const todayShift = shiftFor(db.work, myEmp, todayISO(), db.branches);
    const late = lateMinutesAgainst(todayShift.start, t, myWork.graceMins) > 0;

    // (old-selfie pruning now happens for every update(), not just this one — see update() itself)
    update((d) => ({
      ...d,
      attendance: [{
        id: uid("att"), empId: myEmp.id, date: todayISO(), clockIn: t, clockOut: "",
        inLoc: loc, outLoc: null, selfie: selfie || "", deviceId: localDevice?.id || "",
        deviceLabel: localDevice?.label || "", ip: ip || "", checks, status, late, reviewNote: "", note: "",
      }, ...d.attendance],
    }));

    if (status === "review") toast(`Clocked in at ${t} — flagged for review (${failed.map((f) => CHECK_LABEL[f]).join(", ")})`, "warn");
    else toast(`Clocked in at ${t}${late ? " (late)" : ""}`, late ? "warn" : "ok");
    return true;
  };

  const clockOut = async () => {
    if (!myTodayAtt || !myTodayAtt.clockIn) { toast("Clock in first", "warn"); return; }
    if (myTodayAtt.clockOut) { toast("You've already clocked out today", "warn"); return; }
    let loc = null;
    if (effectiveWork(db.work, myEmp).requireLocation) {
      setLocating(true);
      const pos = await getPosition();
      setLocating(false);
      loc = stampLocation(db.sites, pos);
    }
    const t = nowHM();
    update((d) => ({ ...d, attendance: d.attendance.map((a) => (a.id === myTodayAtt.id ? { ...a, clockOut: t, outLoc: loc } : a)) }));
    // minutesBetween (not plain subtraction) so a night shift clocking out
    // after midnight doesn't show as a negative/"—" duration.
    toast(`Clocked out at ${t} · ${durLabel(minutesBetween(myTodayAtt.clockIn, t))} worked`);
  };

  /* ---- device registration ---- */
  const requestDevice = () => {
    if (!myEmp || !localDevice) return;
    if (myDeviceRecord) { toast(myDeviceRecord.status === "pending" ? "Your request is already with HR" : "This device is already registered", "warn"); return; }
    update((d) => ({ ...d, devices: [...d.devices, { id: uid("dv"), empId: myEmp.id, deviceId: localDevice.id, label: localDevice.label, status: "pending", requested: todayISO(), approved: "" }] }));
    toast("Device registration sent to HR");
  };
  const approveDevice = (id) => {
    update((d) => {
      const rec = d.devices.find((x) => x.id === id);
      if (!rec) return d;
      return {
        ...d,
        devices: d.devices.map((x) =>
          x.id === id ? { ...x, status: "active", approved: todayISO() }
            : x.empId === rec.empId && x.status === "active" ? { ...x, status: "revoked" } : x),
      };
    });
    toast("Device approved · any previous device revoked");
  };
  const revokeDevice = (id) => { update((d) => ({ ...d, devices: d.devices.map((x) => (x.id === id ? { ...x, status: "revoked" } : x)) })); toast("Device revoked", "danger"); };
  const removeDevice = (id) => { update((d) => ({ ...d, devices: d.devices.filter((x) => x.id !== id) })); toast("Device removed", "danger"); };

  /* ---- attendance review ---- */
  const reviewAttendance = (id, approve, note) => {
    update((d) => ({ ...d, attendance: d.attendance.map((a) => (a.id === id ? { ...a, status: approve ? "approved" : "rejected", reviewNote: note || "" } : a)) }));
    toast(approve ? "Attendance approved" : "Attendance rejected", approve ? "ok" : "danger");
  };

  /* ---- work sites ---- */
  const addSite = (s) => {
    if (!s.name.trim()) { toast("Give the location a name", "warn"); return false; }
    if (s.lat === "" || s.lng === "" || isNaN(Number(s.lat)) || isNaN(Number(s.lng))) { toast("Add valid coordinates", "warn"); return false; }
    update((d) => ({ ...d, sites: [...d.sites, { id: uid("site"), name: s.name.trim(), lat: Number(s.lat), lng: Number(s.lng), radius: Number(s.radius) || 200 }] }));
    toast("Work location saved");
    return true;
  };
  const deleteSite = (id) => { update((d) => ({ ...d, sites: d.sites.filter((s) => s.id !== id) })); toast("Location removed", "danger"); };

  const addManualAttendance = (rec) => {
    if (!rec.empId || !rec.date || !rec.clockIn) { toast("Pick a person, a date and a start time", "warn"); return false; }
    update((d) => ({ ...d, attendance: [{ id: uid("att"), ...rec, note: rec.note || "Added by HR" }, ...d.attendance.filter((a) => !(a.empId === rec.empId && a.date === rec.date))] }));
    toast("Attendance recorded");
    return true;
  };
  const deleteAttendance = (id) => { update((d) => ({ ...d, attendance: d.attendance.filter((a) => a.id !== id) })); toast("Record removed", "danger"); };

  /* ---- Phase 2: rota ---- */
  const addShift = (s) => {
    if (!s.empId || !s.date || !s.start || !s.end) { toast("Fill in the person, date and times", "warn"); return false; }
    if (hmToMin(s.end) <= hmToMin(s.start)) { toast("The end time must be after the start time", "warn"); return false; }
    update((d) => ({ ...d, shifts: [...d.shifts, { id: uid("sh"), ...s }] }));
    toast("Shift added");
    return true;
  };
  const deleteShift = (id) => { update((d) => ({ ...d, shifts: d.shifts.filter((x) => x.id !== id) })); toast("Shift removed", "danger"); };
  const copyWeek = (fromMon, toMon) => {
    const fromKeys = [...Array(7)].map((_, i) => iso(addDays(fromMon, i)));
    const toKeys = [...Array(7)].map((_, i) => iso(addDays(toMon, i)));
    const src = db.shifts.filter((s) => fromKeys.includes(s.date));
    if (src.length === 0) { toast("That week has no shifts to copy", "warn"); return; }
    const copies = src.map((s) => ({ ...s, id: uid("sh"), date: toKeys[fromKeys.indexOf(s.date)] }));
    update((d) => ({ ...d, shifts: [...d.shifts.filter((s) => !toKeys.includes(s.date)), ...copies] }));
    toast(`${copies.length} shifts copied into this week`);
  };

  /* ---- mid-shift presence check ---- */
  const answerCheck = async ({ dueTime, selfie }) => {
    if (!myEmp) { toast("Your login isn't linked to an employee record", "warn"); return false; }
    const now = nowHM();
    let loc = null;
    const pos = await getPosition();
    loc = pos.error ? { error: pos.error } : stampLocation(db.sites, pos);
    const dueMin = hmToMin(dueTime), nowMin = hmToMin(now);
    const lateBy = Math.max(0, nowMin - dueMin);
    const offSite = loc && !loc.error && db.sites.length && !loc.inside;
    update((d) => ({ ...d, checks: [{
      id: uid("ck"), empId: myEmp.id, date: todayISO(), dueTime,
      answeredAt: now, status: "confirmed", loc, selfie: selfie || "",
      minutesLate: lateBy, note: offSite ? "Answered away from a work location" : "",
    }, ...d.checks.filter((c) => !(c.empId === myEmp.id && c.date === todayISO() && c.dueTime === dueTime))] }));
    toast(offSite ? `Confirmed at ${now} — but away from a work location` : `Confirmed at ${now}`, offSite ? "warn" : "ok");
    return true;
  };

  const excuseCheck = (id, note) => {
    update((d) => ({ ...d, checks: d.checks.map((c) => (c.id === id ? { ...c, status: "excused", note: note || "Excused by manager" } : c)) }));
    toast("Marked as excused");
  };

  /* Records a miss so it survives in history rather than vanishing at midnight. */
  const recordMiss = (empId, date, dueTime) => {
    update((d) => {
      if (d.checks.some((c) => c.empId === empId && c.date === date && c.dueTime === dueTime)) return d;
      return { ...d, checks: [{ id: uid("ck"), empId, date, dueTime, answeredAt: "",
        status: "missed", loc: null, selfie: "", minutesLate: 0, note: "" }, ...d.checks] };
    });
  };

  /* ---- permissions: stepping out, and coming in late ---- */
  const requestPermission = (form) => {
    if (!myEmp) { toast("Your login isn't linked to an employee record", "warn"); return false; }
    if (!form.date) { toast("Pick the date", "warn"); return false; }
    if (form.kind === "late" && !form.fromTime) { toast("What time do you expect to arrive?", "warn"); return false; }
    if (form.kind === "excursion" && (!form.fromTime || !form.toTime)) { toast("Add the times you'll be out", "warn"); return false; }
    if (form.kind === "excursion" && hmToMin(form.toTime) <= hmToMin(form.fromTime)) { toast("The return time must be after you leave", "warn"); return false; }
    if (!form.reason.trim()) { toast("Please give a reason", "warn"); return false; }
    const status = myEmp.managerId ? "pending_manager" : "pending_hr";
    update((d) => ({ ...d, permissions: [{
      id: uid("pm"), empId: myEmp.id, kind: form.kind, category: form.category,
      date: form.date, fromTime: form.fromTime, toTime: form.toTime || "",
      reason: form.reason, area: form.area || "", loc: form.loc || null, capturedAt: form.capturedAt || "",
      status, applied: todayISO(),
    }, ...d.permissions] }));
    toast("Request sent for approval");
    return true;
  };

  const decidePermission = (id, approve) => {
    // Same team-scoping as decideLeave/decideLoan above.
    const target = db.permissions.find((x) => x.id === id);
    if (!isHR) {
      if (!target || target.status !== "pending_manager" || !myTeam.some((m) => m.id === target.empId)) {
        toast("You can only decide requests from your own team", "danger"); return;
      }
    }
    update((d) => ({ ...d, permissions: d.permissions.map((x) => {
      if (x.id !== id) return x;
      if (!approve) return { ...x, status: "declined" };
      if (x.status === "pending_manager" && !isHR) return { ...x, status: "pending_hr" };
      return { ...x, status: "approved" };
    }) }));
    const x = db.permissions.find((y) => y.id === id);
    if (!approve) toast("Request declined", "danger");
    else if (x?.status === "pending_manager" && !isHR) toast("Approved — sent to HR for final sign-off");
    else toast(x?.kind === "late" ? "Approved — no lateness penalty that day" : "Approved");
  };

  /* ---- salary advances & loans ---- */
  const activeLoanFor = (empId) => db.loans.find((l) => l.empId === empId && l.status === "active");
  const monthlyLoanFor = (empId) => { const l = activeLoanFor(empId); return l ? Math.min(l.monthly, l.amount - l.repaid) : 0; };

  const requestLoan = (form) => {
    if (!myEmp) { toast("Your login isn't linked to an employee record", "warn"); return false; }
    const amount = Number(form.amount) || 0;
    const months = Number(form.months) || 0;
    if (amount <= 0) { toast("Enter how much you need", "warn"); return false; }
    if (months < 1) { toast("Choose how many months to repay over", "warn"); return false; }
    if (db.loans.some((l) => l.empId === myEmp.id && (l.status === "pending" || l.status === "active"))) {
      toast("You already have a request or an outstanding balance", "warn"); return false;
    }
    update((d) => ({ ...d, loans: [{ id: uid("ln"), empId: myEmp.id, type: form.type, amount, months, monthly: Math.ceil(amount / months), reason: form.reason || "—", status: "pending", repaid: 0, requested: todayISO(), approved: "" }, ...d.loans] }));
    toast("Request sent for approval");
    return true;
  };

  const decideLoan = (id, approve) => {
    const loan = db.loans.find((l) => l.id === id);
    // A Manager may only decide loans for their own direct reports — HR can
    // decide any. This mirrors decideLeave's intent below; previously
    // nothing here checked myTeam at all (only the Payroll page's UI chose
    // whether to render the button), so calling this directly could act on
    // any employee's loan regardless of who manages them.
    if (!isHR && (!loan || !myTeam.some((m) => m.id === loan.empId))) {
      toast("You can only decide requests from your own team", "danger"); return;
    }
    update((d) => ({ ...d, loans: d.loans.map((l) => (l.id === id ? { ...l, status: approve ? "active" : "declined", approved: todayISO() } : l)) }));
    toast(approve ? "Approved — repayments start with the next pay run" : "Request declined", approve ? "ok" : "danger");
  };
  const writeOffLoan = (id) => { update((d) => ({ ...d, loans: d.loans.map((l) => (l.id === id ? { ...l, status: "settled" } : l)) })); toast("Marked as settled"); };

  /* ---- payroll runs ---- */
  const buildLine = (emp, month, d) => {
    const [y, m] = month.split("-").map(Number);
    const monthPrefix = `${y}-${pad2(m)}`;
    const att = d.attendance.filter((a) => a.empId === emp.id && a.date.startsWith(monthPrefix) && a.clockIn);
    const unpaid = d.leave.filter((l) => l.empId === emp.id && l.status === "approved" && l.type === "Unpaid" && l.from.startsWith(monthPrefix)).reduce((s, l) => s + l.days, 0);
    const paidLeave = d.leave.filter((l) => l.empId === emp.id && l.status === "approved" && l.type !== "Unpaid" && l.type !== "Sick" && l.from.startsWith(monthPrefix)).reduce((s, l) => s + l.days, 0);
    const sick = d.leave.filter((l) => l.empId === emp.id && l.status === "approved" && l.type === "Sick" && l.from.startsWith(monthPrefix)).reduce((s, l) => s + l.days, 0);
    const loan = d.loans.find((l) => l.empId === emp.id && l.status === "active");
    const loanDue = loan ? Math.min(loan.monthly, loan.amount - loan.repaid) : 0;
    const excused = excusedLateDatesFor(d.permissions || [], emp.id, monthPrefix);
    // Dateless shift — used only for the workMinutesPerDay average below, since
    // that needs one representative shift length rather than a per-day one.
    // Lateness/overtime per record uses the day-specific shift (below), so an
    // employee with a per-day weekSchedule is measured against each day's own
    // hours instead of one shift applied to every day.
    const shift = shiftFor(d.work, emp);
    const empWork = effectiveWork(d.work, emp);
    let lateMinutes = 0, lateDays = 0, excusedLateDays = 0, otMins = 0;
    att.forEach((a) => {
      if (excused.includes(a.date)) { excusedLateDays += 1; return; }
      const dayShift = shiftFor(d.work, emp, a.date, d.branches);
      const l = lateMinutesAgainst(dayShift.start, a.clockIn, empWork.graceMins);
      if (l > 0) { lateMinutes += l; lateDays += 1; }
      otMins += overtimeMinutes(dayShift, a.clockIn, a.clockOut);
    });
    const outMins = personalOutMinutes(d.permissions || [], emp.id, monthPrefix);
    // A day spent partly out of the office on approved business still counts
    const outDates = excursionDatesFor(d.permissions || [], emp.id, monthPrefix);
    const clockedDates = new Set(att.map((a) => a.date));
    const creditedDays = outDates.filter((dte) => !clockedDates.has(dte)).length;
    const openMin = hmToMin(d.work.dayStart), closeMin = hmToMin(d.work.dayEnd);
    const workMinutesPerDay = Math.max(60, minutesBetween(shift.start, shift.end) || 480);
    const workingDays = resolveWorkingDays(d.payroll, monthPrefix, d.holidays);
    const extras = {
      workingDays,
      daysWorked: att.length + creditedDays,
      creditedDays,
      unpaidDays: unpaid, leaveDays: paidLeave, sickDays: sick,
      lateMinutes, lateDays, excusedLateDays, personalOutMinutes: outMins, workMinutesPerDay,
      overtimeMins: otMins,
      loan: loanDue,
    };
    return { empId: emp.id, loanId: loan ? loan.id : "", extras, calc: computePayslip(emp, d.payroll, extras) };
  };

  const generatePayrun = (month) => {
    if (db.payruns.some((r) => r.month === month && r.status === "finalised")) { toast("That month is already finalised", "warn"); return; }
    update((d) => {
      const active = d.employees.filter((e) => e.status !== "Exited");
      const lines = active.map((e) => buildLine(e, month, d));
      const rest = d.payruns.filter((r) => r.month !== month);
      return { ...d, payruns: [{ id: uid("pr"), month, status: "draft", created: todayISO(), lines }, ...rest] };
    });
    toast(`Draft pay run built for ${monthLabel(month)}`);
  };

  const updatePayrunLine = (runId, empId, patch) => {
    update((d) => ({
      ...d,
      payruns: d.payruns.map((r) => {
        if (r.id !== runId || r.status === "finalised") return r;
        return {
          ...r,
          lines: r.lines.map((ln) => {
            if (ln.empId !== empId) return ln;
            const emp = d.employees.find((e) => e.id === empId);
            const extras = { ...ln.extras, ...patch };
            return { ...ln, extras, calc: computePayslip(emp, d.payroll, extras) };
          }),
        };
      }),
    }));
  };

  const finalisePayrun = (runId) => {
    update((d) => {
      const run = d.payruns.find((r) => r.id === runId);
      if (!run || run.status === "finalised") return d;
      let loans = d.loans;
      run.lines.forEach((ln) => {
        const paid = ln.calc.deductions.loan;
        if (ln.loanId && paid > 0) {
          loans = loans.map((l) => {
            if (l.id !== ln.loanId) return l;
            const repaid = Math.min(l.amount, l.repaid + paid);
            return { ...l, repaid, status: repaid >= l.amount ? "settled" : l.status };
          });
        }
      });
      return { ...d, loans, payruns: d.payruns.map((r) => (r.id === runId ? { ...r, status: "finalised", finalised: todayISO() } : r)) };
    });
    toast("Pay run finalised · loan balances updated");
  };
  /* Reopen a finalised run. Finalising deducted loan repayments, so reopening
     must put them back — otherwise balances drift every time you correct a run. */
  const reopenPayrun = (runId) => {
    update((d) => {
      const run = d.payruns.find((r) => r.id === runId);
      if (!run || run.status !== "finalised") return d;
      let loans = d.loans;
      run.lines.forEach((ln) => {
        const paid = ln.calc?.deductions?.loan || 0;
        if (ln.loanId && paid > 0) {
          loans = loans.map((l) => {
            if (l.id !== ln.loanId) return l;
            const repaid = Math.max(0, l.repaid - paid);
            // if it had settled itself on the back of this run, make it active again
            const status = l.status === "settled" && repaid < l.amount ? "active" : l.status;
            return { ...l, repaid, status };
          });
        }
      });
      return { ...d, loans, payruns: d.payruns.map((r) => (r.id === runId ? { ...r, status: "draft", finalised: "" } : r)) };
    });
    toast("Pay run reopened · loan repayments reversed", "warn");
  };

  const deletePayrun = (runId) => { update((d) => ({ ...d, payruns: d.payruns.filter((r) => r.id !== runId) })); toast("Draft deleted", "danger"); };

  const exportData = () => {
    try {
      const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `renla-backup-${todayISO()}.json`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("Backup downloaded");
    } catch (e) { toast("Couldn't create the backup file", "danger"); }
  };

  /* ---------- dashboard numbers ---------- */
  const employees = db.employees;
  const total = employees.length;
  const onLeaveNow = employees.filter((e) => isOnLeaveToday(db.leave, e.id));
  const presentNow = total - onLeaveNow.length;
  const pendingForMe = db.leave.filter((l) => {
    if (isHR) return l.status.startsWith("pending");
    if (isManager) return l.status === "pending_manager" && myTeam.some((m) => m.id === l.empId);
    return false;
  });
  const upcomingBdays = employees.map((e) => ({ e, ...(nextBirthday(e.dob) || { diff: 9999, label: "" }) })).filter((x) => x.diff <= 30).sort((a, b) => a.diff - b.diff);
  const myBirthdayToday = Boolean(myEmp?.dob && nextBirthday(myEmp.dob)?.diff === 0);
  const upcomingHols = db.holidays.map((h) => ({ ...h, diff: Math.round((parseD(h.date) - startOfToday()) / 86400000) })).filter((h) => h.diff >= 0).sort((a, b) => a.diff - b.diff);
  const deptCounts = {};
  employees.forEach((e) => { const k = e.dept || "Unassigned"; deptCounts[k] = (deptCounts[k] || 0) + 1; });
  const deptData = Object.entries(deptCounts).map(([name, value]) => ({ name, value }));

  let searchResults = null;
  if (search.trim()) {
    const q = search.toLowerCase();
    searchResults = {
      emps: employees.filter((e) => (e.name + e.title + e.dept).toLowerCase().includes(q)).slice(0, 5),
      news: db.news.filter((n) => n.title.toLowerCase().includes(q)).slice(0, 3),
      docs: db.docs.filter((d) => d.name.toLowerCase().includes(q) && (isHR || !d.hrOnly)).slice(0, 3),
    };
  }

  const NAV = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "employees", label: isHR ? "Employees" : isManager ? "My team" : "Directory", icon: Users },
    { key: "attendance", label: "Attendance", icon: Clock3 },
    { key: "rota", label: "Rota", icon: CalendarRange },
    { key: "leave", label: "Leave", icon: CalendarDays },
    { key: "news", label: "Company news", icon: Newspaper },
    { key: "documents", label: "Documents", icon: FolderClosed },
    { key: "payroll", label: "Payroll", icon: Wallet },
  ];
  if (isHR) NAV.push({ key: "settings", label: "Settings", icon: SettingsIcon });
  const SOON = [
    { key: "performance", label: "Performance", icon: BarChart3, phase: "Phase 4" },
  ];
  const go = (k) => { navigate("/" + k); setNavOpen(false); };

  return (
    <div style={{ ...theme, fontFamily: "var(--font-body)", color: "var(--ink)", background: "var(--paper)" }}>
      <StyleTag />
      <div className="cp-app">
        {navOpen && <div className="cp-scrim" onClick={() => setNavOpen(false)} />}
        <aside className={"cp-sidebar" + (navOpen ? " open" : "")}>
          <div className="cp-brand">
            <div className="cp-brand-mark"><img src={renlaLogoWhite} alt="" width={16} height={18} style={{ display: "block" }} /></div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15.5, letterSpacing: "-0.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{db.company.name}</div>
              <div style={{ fontSize: 10.5, color: "var(--sidebar-muted)" }}>Renla</div>
            </div>
          </div>
          <nav className="cp-nav">
            {NAV.map((n) => (
              <button key={n.key} className={"cp-navitem" + (view === n.key ? " active" : "")} onClick={() => go(n.key)}>
                <n.icon size={17} /> {n.label}
                {n.key === "leave" && pendingForMe.length > 0 && <span className="cp-nav-count">{pendingForMe.length}</span>}
              </button>
            ))}
            <div className="cp-nav-sep">Coming soon</div>
            {SOON.map((n) => (
              <button key={n.key} className={"cp-navitem soon" + (view === n.key ? " active" : "")} onClick={() => go(n.key)}>
                <n.icon size={17} /> {n.label}<span className="cp-nav-phase">{n.phase.replace("Phase ", "P")}</span>
              </button>
            ))}
          </nav>
          <div className="cp-side-foot">
            <div className="cp-side-user" onClick={() => go("profile")} style={{ cursor: "pointer" }} title="My profile">
              <EmpAvatar emp={myEmp} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--sidebar-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.name}</div>
                <div style={{ fontSize: 11, color: "var(--sidebar-muted)" }}>{me.role}</div>
              </div>
              <button className="cp-icon-btn light" onClick={(e) => { e.stopPropagation(); logout(); }} title="Sign out"><LogOut size={15} /></button>
            </div>
          </div>
        </aside>

        <div className="cp-main">
          <header className="cp-topbar">
            <button className="cp-hamburger" onClick={() => setNavOpen(true)}><Menu size={18} /></button>
            <div className="cp-search">
              <Search size={15} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
              <input placeholder="Search people, news, documents…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button className="cp-search-clear" onClick={() => setSearch("")}><X size={14} /></button>}
              {searchResults && (
                <div className="cp-search-panel">
                  {searchResults.emps.length + searchResults.news.length + searchResults.docs.length === 0 && <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>No matches.</div>}
                  {searchResults.emps.map((e) => (
                    <button key={e.id} className="cp-sr" onClick={() => { setSearch(""); go("employees"); }}>
                      <EmpAvatar emp={e} size={28} /><span><b>{e.name}</b><small>{e.title || "—"} · {e.dept || "—"}</small></span>
                    </button>
                  ))}
                  {searchResults.news.map((n) => (
                    <button key={n.id} className="cp-sr" onClick={() => { setSearch(""); go("news"); }}>
                      <span className="cp-sr-ic"><Newspaper size={14} /></span><span><b>{n.title}</b><small>Company news</small></span>
                    </button>
                  ))}
                  {searchResults.docs.map((d) => (
                    <button key={d.id} className="cp-sr" onClick={() => { setSearch(""); go("documents"); }}>
                      <span className="cp-sr-ic"><FileText size={14} /></span><span><b>{d.name}</b><small>{d.cat}</small></span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {saveError && <span title="Changes aren't saving" style={{ color: "var(--danger)", display: "flex" }}><AlertCircle size={17} /></span>}
              {!saveError && pendingSync && <span title="You're offline — this will sync once you're back online" style={{ color: "var(--warn)", display: "flex" }}><Wifi size={17} /></span>}
              <button className="cp-icon-btn" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            </div>
          </header>

          <main className="cp-content">
            <ErrorBoundary key={view}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={
                  <DashboardPage {...{ me, myEmp, isHR, isManager, myTeam, total, presentNow, onLeaveNow, pendingForMe, upcomingBdays, upcomingHols, deptData, db, theme, empById, decideLeave, go, employees, myBirthdayToday, myTodayAtt, performClockIn, clockOut, locating, myDeviceOk, myDeviceRecord }} />
                } />
                <Route path="/employees" element={
                  <EmployeesPage {...{ db, isHR, isManager, myTeam, myEmp, saveEmployee, deleteEmployee, setEmployeeLock, empById, toast }} />
                } />
                <Route path="/attendance" element={
                  <AttendancePage {...{ db, isHR, isManager, myTeam, myEmp, empById, myTodayAtt, performClockIn, clockOut, addManualAttendance, deleteAttendance, locating, localDevice, myDeviceRecord, myDeviceOk, requestDevice, reviewAttendance, answerCheck, excuseCheck, recordMiss, companyId: profile.companyId }} />
                } />
                <Route path="/rota" element={
                  <RotaPage {...{ db, isHR, isManager, myTeam, myEmp, empById, addShift, deleteShift, copyWeek }} />
                } />
                <Route path="/payroll" element={
                  <PayrollPage {...{ db, isHR, isManager, myTeam, myEmp, empById, generatePayrun, updatePayrunLine, finalisePayrun, reopenPayrun, deletePayrun, requestLoan, decideLoan, writeOffLoan, toast }} />
                } />
                <Route path="/leave" element={
                  <LeavePage {...{ db, isHR, isManager, myTeam, myEmp, empById, decideLeave, applyLeave, requestPermission, decidePermission }} />
                } />
                <Route path="/news" element={
                  <NewsPage {...{ db, isHR, publishPost, toggleLike, togglePin, deletePost }} />
                } />
                <Route path="/documents" element={
                  <DocsPage {...{ db, isHR, addDoc, deleteDoc, toast, companyId: profile.companyId }} />
                } />
                <Route path="/settings" element={
                  isHR
                    ? <SettingsPage {...{ db, update, toast, exportData, me, resetAll, addSite, deleteSite, approveDevice, revokeDevice, removeDevice, reload, saveOnboardingRequirements }} />
                    : <Navigate to="/dashboard" replace />
                } />
                <Route path="/profile" element={
                  <ProfilePage {...{ db, myEmp, saveMyProfile, uploadMyAvatar, uploadMyDocument, deleteMyDocument }} />
                } />
                <Route path="/performance" element={<SoonPage item={SOON.find((s) => s.key === "performance")} />} />
                {/* Anything else (a stale bookmark, a typo'd URL) lands back on the dashboard
                    rather than showing a blank page — the old view-state version had no
                    equivalent concept of an "unknown route" since it could only ever hold
                    a key that existed. */}
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>

      <div className="cp-toasts">
        {toasts.map((t) => (
          <div key={t.id} className="cp-toast" style={{ borderLeftColor: t.tone === "danger" ? "var(--danger)" : t.tone === "warn" ? "var(--warn)" : "var(--brand)" }}>
            <span className="cp-toast-ic" style={{ background: t.tone === "danger" ? "var(--danger-soft)" : t.tone === "warn" ? "var(--warn-soft)" : "var(--brand-soft)", color: t.tone === "danger" ? "var(--danger)" : t.tone === "warn" ? "var(--warn)" : "var(--brand)" }}>
              {t.tone === "danger" ? <X size={14} /> : t.tone === "warn" ? <AlertCircle size={14} /> : <Check size={14} />}
            </span>{t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
