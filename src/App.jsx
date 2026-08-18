import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import {
  supabase, configured, signIn as sbSignIn, signUp as sbSignUp, signOut as sbSignOut,
  createCompany, joinCompany, getProfile, onAuthChange,
  loadWorkspace, uploadDocument, signedUrl,
} from "./lib/supabase.js";
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
import { uid, parseD, iso, todayISO, startOfToday, daysInclusive, nextBirthday } from "./lib/format.js";
import { distLabel, getPosition, locErrLabel, stampLocation } from "./lib/geo.js";
import { fetchIP, evaluateChecks, CHECK_LABEL, pruneSelfies } from "./lib/presence.js";
import { isOnLeaveToday } from "./features/insights/monthInsights.js";
import { monthLabel, normalizeDb } from "./lib/payrollHelpers.js";
import { Avatar, Card, Btn } from "./components/ui.jsx";
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
  const [locating, setLocating] = useState(false);
  const [localDevice, setLocalDevice] = useState(null);
  const [profile, setProfile] = useState(null);      // signed-in user + role
  const [authReady, setAuthReady] = useState(false);
  const [recovery, setRecovery] = useState(false);   // came in via a password-reset link
  const [loadError, setLoadError] = useState("");
  const dbRef = useRef(null);
  const syncing = useRef(false);

  const theme = dark ? DARK : LIGHT;

  const toast = useCallback((msg, tone = "ok") => {
    const id = uid("t");
    setToasts((t) => [...t, { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  /* ---------- boot: watch the session, then load the workspace ---------- */
  useEffect(() => { setLocalDevice(getLocalDevice()); }, []);

  useEffect(() => {
    if (!configured) { setAuthReady(true); setBooted(true); return; }
    let alive = true;

    const refresh = async () => {
      try {
        const p = await getProfile();
        if (!alive) return;
        setProfile(p);
        if (p && !p.noCompany) {
          const ws = await loadWorkspace(p);
          if (!alive) return;
          const n = normalizeDb(ws);
          dbRef.current = n;
          setDb(n);
        } else {
          dbRef.current = null;
          setDb(null);
        }
      } catch (e) {
        if (alive) setLoadError(e.message || "Couldn't load your workspace.");
      } finally {
        if (alive) { setAuthReady(true); setBooted(true); }
      }
    };

    refresh();
    const off = onAuthChange((_session, event) => {
      // A password-reset link lands here as a real sign-in (Supabase opens a
      // session for it), so without this check the person would land straight
      // in the dashboard instead of being asked to choose a new password.
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setBooted(false);
      refresh();
    });
    return () => { alive = false; off(); };
  }, []);

  const reload = useCallback(async () => {
    if (!profile || profile.noCompany) return;
    try {
      const ws = normalizeDb(await loadWorkspace(profile));
      dbRef.current = ws;
      setDb(ws);
    } catch (e) { toast(e.message || "Couldn't refresh", "danger"); }
  }, [profile]);

  /* ---------- persistence: change the state, then save what changed ---------- */
  const update = useCallback((fn) => {
    setDb((cur) => {
      if (!cur) return cur;
      const before = dbRef.current || cur;
      const next = fn(cur);
      dbRef.current = next;
      if (configured && profile?.companyId && !syncing.current) {
        syncing.current = true;
        syncChanges(before, next, profile.companyId)
          .then(({ patches, errors }) => {
            if (patches.length) {
              setDb((d) => {
                if (!d) return d;
                let out = d;
                patches.forEach((p) => {
                  out = { ...out, [p.collection]: out[p.collection].map((x) => (x.id === p.id ? { ...x, ...p.changes } : x)) };
                });
                dbRef.current = out;
                return out;
              });
            }
            if (errors.length) {
              setSaveError(true);
              toast(errors[0], "danger");
            } else {
              setSaveError(false);
            }
          })
          .catch((e) => { setSaveError(true); toast(e.message || "Couldn't save", "danger"); })
          .finally(() => { syncing.current = false; });
      }
      return next;
    });
  }, [profile, toast]);

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

  if (!profile) return <AuthScreen theme={theme} dark={dark} setDark={setDark} />;
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
  const logout = async () => { setNavOpen(false); dbRef.current = null; setDb(null); setProfile(null); await sbSignOut(); };

  const saveEmployee = (emp, isNew) => {
    update((d) => ({
      ...d,
      employees: isNew ? [...d.employees, emp] : d.employees.map((e) => (e.id === emp.id ? emp : e)),
      departments: emp.dept && !d.departments.includes(emp.dept) ? [...d.departments, emp.dept] : d.departments,
    }));
    toast(isNew ? "Employee added" : "Changes saved");
  };

  const deleteEmployee = (id) => {
    update((d) => ({
      ...d,
      employees: d.employees.filter((e) => e.id !== id).map((e) => (e.managerId === id ? { ...e, managerId: "" } : e)),
      leave: d.leave.filter((l) => l.empId !== id),
      users: d.users.filter((u) => u.employeeId !== id),
    }));
    toast("Employee removed", "danger");
  };

  const applyLeave = (form) => {
    if (!myEmp) { toast("Your login isn't linked to an employee record", "warn"); return false; }
    const validation = validateLeaveDates(form.from, form.to, parseD);
    if (!validation.ok) { toast(validation.error, "warn"); return false; }
    const days = daysInclusive(form.from, form.to);
    const status = myEmp.managerId ? "pending_manager" : "pending_hr";
    update((d) => ({ ...d, leave: [{ id: uid("lv"), empId: myEmp.id, type: form.type, from: form.from, to: form.to, days, reason: form.reason || "—", status, applied: todayISO() }, ...d.leave] }));
    toast("Request submitted for approval");
    return true;
  };

  const decideLeave = (id, approve) => {
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
    const late = hmToMin(t) > hmToMin(myWork.dayStart) + myWork.graceMins;

    update((d) => ({
      ...d,
      attendance: pruneSelfies([{
        id: uid("att"), empId: myEmp.id, date: todayISO(), clockIn: t, clockOut: "",
        inLoc: loc, outLoc: null, selfie: selfie || "", deviceId: localDevice?.id || "",
        deviceLabel: localDevice?.label || "", ip: ip || "", checks, status, late, reviewNote: "", note: "",
      }, ...d.attendance]),
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
    toast(`Clocked out at ${t} · ${durLabel(hmToMin(t) - hmToMin(myTodayAtt.clockIn))} worked`);
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
      const dayShift = shiftFor(d.work, emp, a.date);
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
            <div className="cp-side-user">
              <Avatar name={me.name} size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--sidebar-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{me.name}</div>
                <div style={{ fontSize: 11, color: "var(--sidebar-muted)" }}>{me.role}</div>
              </div>
              <button className="cp-icon-btn light" onClick={logout} title="Sign out"><LogOut size={15} /></button>
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
                      <Avatar name={e.name} size={28} /><span><b>{e.name}</b><small>{e.title || "—"} · {e.dept || "—"}</small></span>
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
              <button className="cp-icon-btn" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</button>
            </div>
          </header>

          <main className="cp-content">
            <ErrorBoundary key={view}>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/dashboard" element={
                  <DashboardPage {...{ me, myEmp, isHR, isManager, myTeam, total, presentNow, onLeaveNow, pendingForMe, upcomingBdays, upcomingHols, deptData, db, theme, empById, decideLeave, go, employees }} />
                } />
                <Route path="/employees" element={
                  <EmployeesPage {...{ db, isHR, isManager, myTeam, myEmp, saveEmployee, deleteEmployee, empById, toast }} />
                } />
                <Route path="/attendance" element={
                  <AttendancePage {...{ db, isHR, isManager, myTeam, myEmp, empById, myTodayAtt, performClockIn, clockOut, addManualAttendance, deleteAttendance, locating, localDevice, myDeviceRecord, myDeviceOk, requestDevice, reviewAttendance, answerCheck, excuseCheck, recordMiss }} />
                } />
                <Route path="/rota" element={
                  <RotaPage {...{ db, isHR, isManager, myTeam, myEmp, empById, addShift, deleteShift, copyWeek }} />
                } />
                <Route path="/payroll" element={
                  <PayrollPage {...{ db, isHR, isManager, myEmp, empById, generatePayrun, updatePayrunLine, finalisePayrun, reopenPayrun, deletePayrun, requestLoan, decideLoan, writeOffLoan, toast }} />
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
                    ? <SettingsPage {...{ db, update, toast, exportData, me, resetAll, addSite, deleteSite, approveDevice, revokeDevice, removeDevice, reload }} />
                    : <Navigate to="/dashboard" replace />
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
