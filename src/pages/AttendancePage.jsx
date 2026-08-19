import React, { useState, useEffect, useRef } from "react";
import { CalendarDays, Clock3, Plus, Check, X, MapPin, ShieldCheck, Download, BadgeCheck, Trash2, Info, Play, Square, Timer, AlertTriangle, Camera, Smartphone, Wifi, ShieldAlert, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { signedUrl, loadAttendanceHistory, ATTENDANCE_WINDOW_DAYS } from "../lib/supabase.js";
import { DAYS, nowHM, hmToMin, durLabel, addDays, effectiveWork, anyoneHas, shiftFor, lateMinutesAgainst, minutesBetween } from "../features/attendance/attendanceLogic.js";
import { parseD, iso, todayISO, startOfToday, fmtShort, fmtLong } from "../lib/format.js";
import { distLabel, locErrLabel } from "../lib/geo.js";
import { CHECK_LABEL, dueChecksFor, checkState } from "../lib/presence.js";
import { isOnLeaveToday } from "../features/insights/monthInsights.js";
import { monthLabel, monthOptions } from "../lib/payrollHelpers.js";
import { Avatar, EmpAvatar, Badge, Card, Btn, Stat, Field, Section, PageHead, Empty, Modal } from "../components/ui.jsx";

// `shift` is this employee's actual shift for the record's date (from
// shiftFor) — not the company's flat dayStart/dayEnd — so night-shift,
// branch-hours, and custom-hours staff are judged against their own hours.
function attStatus(rec, shift, graceMins) {
  if (!rec || !rec.clockIn) return { tone: "muted", label: "Not clocked in" };
  const late = lateMinutesAgainst(shift.start, rec.clockIn, graceMins) > 0;
  if (!rec.clockOut) return { tone: late ? "warn" : "ok", label: late ? `Late · in ${rec.clockIn}` : `In since ${rec.clockIn}` };
  return { tone: "brand", label: `${rec.clockIn}–${rec.clockOut}` };
}

function SelfieThumb({ path, className = "cp-thumb", onClick }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (!path) return;
    if (path.startsWith("data:")) { setUrl(path); return; }
    signedUrl("selfies", path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);
  if (!path) return null;
  if (!url) return <div className={className} style={{ background: "var(--card2)" }} />;
  return <img src={url} alt="Clock-in photo" className={className} onClick={onClick} />;
}

function CheckPill({ name, state }) {
  const map = { pass: ["ok", CheckCircle2], fail: ["danger", XCircle], skip: ["muted", Info] };
  const [tone, Icon] = map[state] || map.skip;
  return <Badge tone={tone}><Icon size={10} /> {CHECK_LABEL[name] || name}</Badge>;
}

function SelfieCam({ onCapture, onCancel }) {
  const videoRef = React.useRef(null);
  const [stream, setStream] = useState(null);
  const [err, setErr] = useState("");
  const [shot, setShot] = useState("");

  useEffect(() => {
    let active = true, s = null;
    const nav = typeof window !== "undefined" ? window.navigator : null;
    if (!nav || !nav.mediaDevices || !nav.mediaDevices.getUserMedia) { setErr("This device has no camera available."); return; }
    nav.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 480 } }, audio: false })
      .then((st) => {
        if (!active) { st.getTracks().forEach((t) => t.stop()); return; }
        s = st; setStream(st);
        if (videoRef.current) { videoRef.current.srcObject = st; videoRef.current.play().catch(() => {}); }
      })
      .catch((e) => { if (active) setErr(e && e.name === "NotAllowedError" ? "Camera permission was denied." : "Couldn't start the camera."); });
    return () => { active = false; if (s) s.getTracks().forEach((t) => t.stop()); };
  }, []);

  const stop = () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };

  const snap = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) { setErr("Camera isn't ready yet."); return; }
    const size = 180;
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    const ctx = c.getContext("2d");
    const side = Math.min(v.videoWidth, v.videoHeight);
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
    const data = c.toDataURL("image/jpeg", 0.55);
    setShot(data); stop();
  };

  return (
    <div>
      <div className="cp-cam">
        {shot ? <img src={shot} alt="Captured selfie" />
          : err ? <div className="cp-cam-err"><Camera size={26} /><div style={{ marginTop: 10, fontSize: 13 }}>{err}</div></div>
          : <video ref={videoRef} playsInline muted />}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14, justifyContent: "center", flexWrap: "wrap" }}>
        {!shot && !err && <Btn icon={Camera} onClick={snap}>Take photo</Btn>}
        {shot && <><Btn variant="ghost" icon={RefreshCw} onClick={() => { setShot(""); onCancel("retake"); }}>Retake</Btn><Btn icon={Check} onClick={() => onCapture(shot)}>Use this photo</Btn></>}
        {err && <Btn variant="ghost" onClick={() => onCapture("")}>Continue without a photo</Btn>}
      </div>
      {err && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10, textAlign: "center" }}>Clocking in without a photo will be flagged for your manager to review.</div>}
    </div>
  );
}

function PresenceCheckModal({ dueTime, onClose, onDone }) {
  const [selfie, setSelfie] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (photo) => {
    setBusy(true);
    const ok = await onDone({ dueTime, selfie: photo });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <div className="cp-modal-wrap">
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-head">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, margin: 0 }}>
            Still at work? · {dueTime} check
          </h3>
          <button className="cp-icon-btn" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>
        <div className="cp-modal-body">
          <p style={{ fontSize: 13.5, color: "var(--muted)", lineHeight: 1.6, margin: "0 0 16px", textAlign: "center" }}>
            Take a quick photo to confirm you're still on site. Your location is checked at the same moment.
          </p>
          {!selfie
            ? <SelfieCam onCancel={() => {}} onCapture={(photo) => setSelfie(photo || "none")} />
            : (
              <div style={{ textAlign: "center" }}>
                {selfie !== "none" && <img src={selfie} alt="Your photo" style={{ width: 120, height: 120, borderRadius: 16, objectFit: "cover", border: "2px solid var(--brand-soft)" }} />}
                <div style={{ marginTop: 18 }}>
                  <Btn icon={busy ? Timer : Check} disabled={busy} onClick={() => run(selfie === "none" ? "" : selfie)}>
                    {busy ? "Confirming…" : "Confirm I'm here"}
                  </Btn>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function ClockInModal({ work, deviceOk, deviceLabel, onClose, onDone }) {
  const [phase, setPhase] = useState(work.requireSelfie ? "selfie" : "confirm");
  const [selfie, setSelfie] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (photo) => {
    setBusy(true);
    const ok = await onDone({ selfie: photo });
    setBusy(false);
    if (ok) onClose();
  };

  return (
    <div className="cp-modal-wrap" onClick={busy ? undefined : onClose}>
      <div className="cp-modal" onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-head">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, margin: 0 }}>Clock in</h3>
          <button className="cp-icon-btn" onClick={onClose} disabled={busy}><X size={16} /></button>
        </div>
        <div className="cp-modal-body">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {work.requireLocation && <Badge tone="muted"><MapPin size={10} /> Location</Badge>}
            {work.requireDevice && <Badge tone={deviceOk ? "ok" : "danger"}><Smartphone size={10} /> {deviceOk ? deviceLabel || "Registered device" : "Unregistered device"}</Badge>}
            {work.requireSelfie && <Badge tone="muted"><Camera size={10} /> Selfie</Badge>}
            {work.recordIP && <Badge tone="muted"><Wifi size={10} /> IP</Badge>}
          </div>

          {phase === "selfie" && !selfie && (
            <SelfieCam
              onCancel={() => {}}
              onCapture={(photo) => { setSelfie(photo || "none"); setPhase("confirm"); }}
            />
          )}

          {phase === "confirm" && (
            <div>
              {selfie && selfie !== "none" && (
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <img src={selfie} alt="Your selfie" style={{ width: 96, height: 96, borderRadius: 14, objectFit: "cover", border: "2px solid var(--brand-soft)" }} />
                </div>
              )}
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, textAlign: "center", color: "var(--muted)" }}>
                {work.requireDevice && !deviceOk
                  ? "This device isn't registered to you, so your clock-in will be sent to your manager for review."
                  : "Ready to clock in. Your checks will be recorded with the time."}
              </p>
              <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
                <Btn icon={busy ? Timer : Play} disabled={busy} onClick={() => run(selfie === "none" ? "" : selfie)}>
                  {busy ? "Checking…" : "Confirm clock in"}
                </Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// The "clock in / clock out" card — shown on the Attendance page and also
// (per the user's request — the dashboard should be a place employees
// actually use, not just a reporting screen for HR) on the Dashboard.
// Self-contained: computes its own effective shift/work rules and owns the
// verification-modal state, so either page can drop it in with just the
// handful of values App.jsx already computes (myTodayAtt, performClockIn,
// clockOut, locating, myDeviceOk/myDeviceRecord for the device check).
function ClockCard({ db, myEmp, myTodayAtt, performClockIn, clockOut, locating, myDeviceOk, myDeviceRecord }) {
  const [clockOpen, setClockOpen] = useState(false);
  if (!myEmp) return null;
  const work = db.work;
  const myWork = effectiveWork(work, myEmp);
  const today = todayISO();
  const myShift = shiftFor(work, myEmp, today, db.branches);
  const verifyOn = myWork.requireLocation || myWork.requireDevice || myWork.requireSelfie || myWork.recordIP;
  return (
    <Card style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 500 }}>Today · {fmtLong(today)}</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, marginTop: 4, letterSpacing: "-0.02em" }}>
            {!myTodayAtt || !myTodayAtt.clockIn ? "Not clocked in yet"
              : myTodayAtt.clockOut ? `Done · ${durLabel(minutesBetween(myTodayAtt.clockIn, myTodayAtt.clockOut))}`
              : `Clocked in at ${myTodayAtt.clockIn}`}
          </div>
          {myTodayAtt && myTodayAtt.clockIn && !myTodayAtt.clockOut && (
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>
              {myShift && lateMinutesAgainst(myShift.start, myTodayAtt.clockIn, work.graceMins) > 0
                ? <span style={{ color: "var(--warn)", fontWeight: 600 }}>Marked late</span>
                : "On time"}
            </div>
          )}
          {myTodayAtt?.inLoc && <div style={{ marginTop: 8 }}><LocBadge loc={myTodayAtt.inLoc} /></div>}
          {myTodayAtt?.checks && Object.keys(myTodayAtt.checks).length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {Object.entries(myTodayAtt.checks).map(([k, v]) => <CheckPill key={k} name={k} state={v} />)}
              {myTodayAtt.status === "review" && <Badge tone="warn"><ShieldAlert size={10} /> Awaiting review</Badge>}
              {myTodayAtt.status === "rejected" && <Badge tone="danger"><XCircle size={10} /> Rejected</Badge>}
            </div>
          )}
          {verifyOn && (
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 10, display: "flex", gap: 6, alignItems: "flex-start", maxWidth: 440, lineHeight: 1.5 }}>
              <ShieldCheck size={13} style={{ marginTop: 1, flex: "0 0 auto" }} />
              <span>Checks run only when you clock in and out{work.requireSelfie ? ", including a photo taken at that moment" : ""} — never in between.</span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {locating ? <Btn disabled icon={Timer}>Checking…</Btn>
            : (!myTodayAtt || !myTodayAtt.clockIn)
            ? <Btn icon={Play} onClick={() => (verifyOn ? setClockOpen(true) : performClockIn({ selfie: "" }))}>Clock in</Btn>
            : !myTodayAtt.clockOut
              ? <Btn icon={Square} variant="ghost" onClick={clockOut}>Clock out</Btn>
              : <Badge tone="ok"><Check size={11} /> Finished for today</Badge>}
        </div>
      </div>

      {clockOpen && (
        <ClockInModal
          work={work} deviceOk={myDeviceOk} deviceLabel={myDeviceRecord?.label}
          onClose={() => setClockOpen(false)}
          onDone={performClockIn}
        />
      )}
    </Card>
  );
}

function LocBadge({ loc }) {
  if (!loc) return null;
  if (loc.error) return <Badge tone="muted"><MapPin size={10} /> {locErrLabel(loc.error)}</Badge>;
  if (loc.inside) return <Badge tone="ok"><MapPin size={10} /> {loc.siteName || "On site"}</Badge>;
  return <Badge tone="warn"><MapPin size={10} /> {loc.siteName ? `${distLabel(loc.dist)} from ${loc.siteName}` : "Off site"}</Badge>;
}

function AttendancePage({ db, isHR, isManager, myTeam, myEmp, empById, myTodayAtt, performClockIn, clockOut, addManualAttendance, deleteAttendance, locating, localDevice, myDeviceRecord, myDeviceOk, requestDevice, reviewAttendance, answerCheck, excuseCheck, recordMiss, companyId }) {
  const [tab, setTab] = useState(isHR || isManager ? "today" : "me");
  const [manual, setManual] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [histEmp, setHistEmp] = useState(isHR || isManager ? "all" : "me");
  const [histMonth, setHistMonth] = useState("all");
  const [checkOpen, setCheckOpen] = useState(null);
  const work = db.work;                                  // company defaults
  const myWork = effectiveWork(work, myEmp);             // what applies to me
  const nowMin = hmToMin(nowHM());
  const today = todayISO();
  const geoOn = anyoneHas(work, db.employees, "requireLocation");

  const scope = isHR ? db.employees : isManager ? [...myTeam, myEmp].filter(Boolean) : myEmp ? [myEmp] : [];
  const recFor = (empId, date) => db.attendance.find((a) => a.empId === empId && a.date === date);

  // my last 7 days
  const myWeek = myEmp ? [...Array(7)].map((_, i) => {
    const d = iso(addDays(startOfToday(), -i));
    const r = recFor(myEmp.id, d);
    const mins = r && r.clockIn && r.clockOut ? minutesBetween(r.clockIn, r.clockOut) : null;
    return { date: d, rec: r, mins };
  }) : [];
  const weekMins = myWeek.reduce((s, x) => s + (x.mins || 0), 0);

  const boardRows = scope.map((e) => {
    const rec = recFor(e.id, today);
    const onLeave = isOnLeaveToday(db.leave, e.id);
    const ew = effectiveWork(work, e);
    const shift = shiftFor(work, e, today, db.branches);
    const due = rec ? dueChecksFor(ew, rec.clockIn, rec.clockOut, nowMin) : [];
    const checks = due.map((t) => {
      const cr = db.checks.find((c) => c.empId === e.id && c.date === today && c.dueTime === t);
      return { dueTime: t, rec: cr, state: checkState(cr, t, nowMin, ew.checkWindowMins) };
    });
    return { e, rec, onLeave, checks, ew, shift,
      missedCount: checks.filter((c) => c.state === "missed").length,
      st: onLeave ? { tone: "accent", label: "On leave" } : attStatus(rec, shift, work.graceMins) };
  });
  const inCount = boardRows.filter((r) => r.rec && r.rec.clockIn && !r.rec.clockOut && !r.onLeave).length;
  const doneCount = boardRows.filter((r) => r.rec && r.rec.clockOut).length;
  const missing = boardRows.filter((r) => !r.rec && !r.onLeave).length;
  /* my checks for today */
  const myChecksToday = myEmp ? db.checks.filter((c) => c.empId === myEmp.id && c.date === today) : [];
  const myDue = myEmp && myTodayAtt
    ? dueChecksFor(myWork, myTodayAtt.clockIn, myTodayAtt.clockOut, nowMin).map((t) => {
        const rec = myChecksToday.find((c) => c.dueTime === t);
        return { dueTime: t, rec, state: checkState(rec, t, nowMin, myWork.checkWindowMins) };
      })
    : [];
  const myOutstanding = myDue.filter((x) => x.state === "pending");

  const scopeIds = scope.map((e) => e.id);
  const missedChecks = [];
  {
    boardRows.forEach(({ e, checks }) => {
      checks.filter((c) => c.state === "missed").forEach((c) => {
        missedChecks.push({ empId: e.id, date: today, dueTime: c.dueTime, id: c.rec?.id || "" });
      });
    });
  }

  const flagged = db.attendance.filter((a) => a.status === "review" && scopeIds.includes(a.empId)).sort((a, b) => b.date.localeCompare(a.date));

  /* ---- history ----
     db.attendance only ever holds the last ATTENDANCE_WINDOW_DAYS of
     records (see loadWorkspace in supabase.js) — that's a deliberate
     scale-proofing limit, not a bug, so an old company's boot load and
     every edit's diff cost stay bounded regardless of how many years of
     attendance history it's accumulated. Picking a month older than that
     window below fetches it directly and read-only via
     loadAttendanceHistory — those rows are held in this component's own
     state (olderHistRows) and never merge into db.attendance/get near
     sync.js, so they can't ever be mistaken for "record no longer exists,
     delete it" the way widening the synced snapshot would risk. */
  const windowCutoff = iso(addDays(startOfToday(), -ATTENDANCE_WINDOW_DAYS));
  const histOutOfWindow = histMonth !== "all" && histMonth < windowCutoff.slice(0, 7);
  const histEmpId = (isHR || isManager) ? histEmp : (myEmp?.id || "all");
  const [olderHist, setOlderHist] = useState({ key: "", loading: false, rows: [] });
  useEffect(() => {
    if (!histOutOfWindow || !companyId || !histEmpId) return;
    const key = histMonth + "|" + histEmpId;
    if (olderHist.key === key) return;
    let alive = true;
    setOlderHist({ key, loading: true, rows: [] });
    loadAttendanceHistory(companyId, { empId: histEmpId, month: histMonth })
      .then((rows) => { if (alive) setOlderHist({ key, loading: false, rows }); })
      .catch(() => { if (alive) setOlderHist({ key, loading: false, rows: [] }); });
    return () => { alive = false; };
  }, [histOutOfWindow, histMonth, histEmpId, companyId]);

  const histRows = (histOutOfWindow ? olderHist.rows : db.attendance)
    .filter((a) => {
      if (!scopeIds.includes(a.empId)) return false;
      if (!isHR && !isManager) return a.empId === myEmp?.id;
      if (histEmp !== "all" && a.empId !== histEmp) return false;
      if (histMonth !== "all" && !a.date.startsWith(histMonth)) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const histTotals = histRows.reduce((acc, r) => {
    const mins = r.clockIn && r.clockOut ? minutesBetween(r.clockIn, r.clockOut) : null;
    if (mins != null && mins > 0) { acc.minutes += mins; acc.days += 1; }
    const shift = shiftFor(work, empById(r.empId), r.date, db.branches);
    if (r.clockIn && lateMinutesAgainst(shift.start, r.clockIn, work.graceMins || 0) > 0) acc.late += 1;
    return acc;
  }, { minutes: 0, days: 0, late: 0 });

  const exportHistory = () => {
    try {
      const head = ["Date", "Employee", "Clock in", "Clock out", "Hours", "Late", "Status"];
      const lines = histRows.map((r) => {
        const e = empById(r.empId);
        const shift = shiftFor(work, e, r.date, db.branches);
        const mins = r.clockIn && r.clockOut ? minutesBetween(r.clockIn, r.clockOut) : null;
        const late = r.clockIn && lateMinutesAgainst(shift.start, r.clockIn, work.graceMins || 0) > 0;
        return [r.date, e?.name || "", r.clockIn || "", r.clockOut || "",
                mins != null ? (mins / 60).toFixed(2) : "", late ? "Yes" : "No", r.status || ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
      });
      const csv = [head.join(","), ...lines].join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-${histMonth === "all" ? "recent" : histMonth}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { /* nothing sensible to do */ }
  };

  return (
    <div className="cp-fade">
      <PageHead title="Attendance" sub={`Working day ${work.dayStart}–${work.dayEnd} · ${work.graceMins} min grace`}
        action={isHR && <Btn icon={Plus} onClick={() => setManual({ empId: "", date: today, clockIn: "", clockOut: "", note: "" })}>Record manually</Btn>} />

      {/* my clock card */}
      <ClockCard db={db} myEmp={myEmp} myTodayAtt={myTodayAtt} performClockIn={performClockIn} clockOut={clockOut}
        locating={locating} myDeviceOk={myDeviceOk} myDeviceRecord={myDeviceRecord} />

      {myOutstanding.length > 0 && (
        <Card style={{ marginBottom: 18, borderColor: "var(--brand)" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--brand-soft)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><BadgeCheck size={18} /></span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {myOutstanding.length === 1 ? `Your ${myOutstanding[0].dueTime} check is due` : `${myOutstanding.length} presence checks are due`}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                Confirm you're still at work — a photo and your location. You have {myWork.checkWindowMins} minutes from the scheduled time.
              </div>
            </div>
            <Btn size="sm" icon={Camera} onClick={() => setCheckOpen(myOutstanding[0].dueTime)}>Confirm now</Btn>
          </div>
        </Card>
      )}

      {myEmp && myDue.length > 0 && myOutstanding.length === 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          {myDue.map((x) => (
            <Badge key={x.dueTime} tone={x.state === "confirmed" ? "ok" : x.state === "excused" ? "muted" : "danger"}>
              {x.dueTime} · {x.state === "confirmed" ? `confirmed ${x.rec.answeredAt}` : x.state === "excused" ? "excused" : "missed"}
            </Badge>
          ))}
        </div>
      )}

      {myWork.requireDevice && myEmp && !myDeviceOk && (
        <Card style={{ marginBottom: 18, borderColor: "var(--warn)" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--warn-soft)", color: "var(--warn)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><Smartphone size={18} /></span>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>
                {myDeviceRecord?.status === "pending" ? "Device registration pending" : myDeviceRecord?.status === "revoked" ? "This device was revoked" : "This device isn't registered"}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
                {myDeviceRecord?.status === "pending"
                  ? `Waiting for HR to approve ${myDeviceRecord.label}. You can still clock in — it'll be flagged for review.`
                  : `Register ${localDevice?.label || "this device"} so your clock-ins are approved automatically.`}
              </div>
            </div>
            {(!myDeviceRecord || myDeviceRecord.status === "revoked") && <Btn size="sm" icon={Smartphone} onClick={requestDevice}>Register this device</Btn>}
          </div>
        </Card>
      )}

      {!isHR && !isManager && myEmp && (
        <div className="cp-tabs">
          <button className={"cp-tab" + (tab === "me" ? " active" : "")} onClick={() => setTab("me")}>Last 7 days</button>
          <button className={"cp-tab" + (tab === "history" ? " active" : "")} onClick={() => setTab("history")}>My full history</button>
        </div>
      )}

      {(isHR || isManager) && (
        <div className="cp-tabs">
          <button className={"cp-tab" + (tab === "today" ? " active" : "")} onClick={() => setTab("today")}>Today's board</button>
          <button className={"cp-tab" + (tab === "review" ? " active" : "")} onClick={() => setTab("review")}>
            Review{flagged.length ? ` · ${flagged.length}` : ""}
          </button>
          <button className={"cp-tab" + (tab === "me" ? " active" : "")} onClick={() => setTab("me")}>My record</button>
          <button className={"cp-tab" + (tab === "history" ? " active" : "")} onClick={() => setTab("history")}>History</button>
        </div>
      )}

      {tab === "review" && (isHR || isManager) && missedChecks.length > 0 && (
        <Card style={{ marginBottom: 18 }}>
          <Section title={`Missed presence checks · ${missedChecks.length}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {missedChecks.map((m) => {
                const e = empById(m.empId);
                return (
                  <div key={m.empId + m.dueTime} className="cp-leaverow">
                    <EmpAvatar emp={e} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e?.name || "Unknown"}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                        Didn't confirm the {m.dueTime} check · {fmtShort(m.date)}
                      </div>
                    </div>
                    <Badge tone="danger">Missed</Badge>
                    <button className="cp-mini" onClick={() => {
                      if (m.id) excuseCheck(m.id, "Excused by manager");
                      else { recordMiss(m.empId, m.date, m.dueTime); toast("Recorded — excuse it once it appears", "warn"); }
                    }}>Excuse</button>
                  </div>
                );
              })}
            </div>
          </Section>
        </Card>
      )}

      {tab === "review" && (isHR || isManager) && (
        <Card>
          <Section title="Clock-ins needing a look">
            {flagged.length === 0 ? <Empty text="Nothing flagged — all clock-ins passed their checks." /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {flagged.map((a) => {
                  const e = empById(a.empId);
                  return (
                    <div key={a.id} className="cp-leaverow" style={{ alignItems: "flex-start" }}>
                      {a.selfie
                        ? <SelfieThumb path={a.selfie} onClick={() => setZoom(a)} />
                        : <EmpAvatar emp={e} size={40} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>{e?.name || "Unknown"}</div>
                        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 1 }}>{fmtLong(a.date)} · clocked in {a.clockIn}{a.deviceLabel ? ` · ${a.deviceLabel}` : ""}{a.ip ? ` · ${a.ip}` : ""}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                          {Object.entries(a.checks || {}).map(([k, v]) => <CheckPill key={k} name={k} state={v} />)}
                          {a.inLoc && <LocBadge loc={a.inLoc} />}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flex: "0 0 auto" }}>
                        <button className="cp-mini cp-mini-ok" onClick={() => reviewAttendance(a.id, true)}><Check size={14} /> Approve</button>
                        <button className="cp-mini cp-mini-no" onClick={() => reviewAttendance(a.id, false)}><X size={14} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>
        </Card>
      )}

      {tab === "today" && (isHR || isManager) && (
        <>
          <div className="cp-tiles" style={{ marginBottom: 18 }}>
            <Stat icon={Timer} label="Currently in" value={inCount} sub="Clocked in, not out" />
            <Stat icon={Check} label="Finished" value={doneCount} sub="Clocked out today" />
            <Stat icon={CalendarDays} label="On leave" value={boardRows.filter((r) => r.onLeave).length} tone="accent" />
            <Stat icon={AlertTriangle} label="Needs review" value={flagged.length} sub="Failed a check" tone="accent" />
          </div>
          <Card pad={0}>
            <div className="cp-table-wrap">
              <table className="cp-table">
                <thead><tr>
                  <th>Employee</th><th>Time</th>
                  {anyoneHas(work, db.employees, "requireSelfie") && <th>Selfie</th>}
                  {geoOn && <th>GPS</th>}
                  {anyoneHas(work, db.employees, "requireDevice") && <th>Device</th>}
                  {anyoneHas(work, db.employees, "recordIP") && <th>IP</th>}
                  {anyoneHas(work, db.employees, "presenceChecks") && <th>Checks</th>}
                  <th>Hours</th><th>Status</th>{isHR && <th></th>}
                </tr></thead>
                <tbody>
                  {boardRows.map(({ e, rec, st }) => (
                    <tr key={e.id}>
                      <td><div style={{ display: "flex", alignItems: "center", gap: 11 }}><EmpAvatar emp={e} size={32} /><div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{e.name}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{e.title || "—"}</div></div></div></td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 13, whiteSpace: "nowrap" }}>{rec?.clockIn || "—"}{rec?.clockOut ? ` – ${rec.clockOut}` : ""}</td>
                      {anyoneHas(work, db.employees, "requireSelfie") && <td>{rec?.selfie ? <SelfieThumb path={rec.selfie} className="cp-thumb sm" onClick={() => setZoom(rec)} /> : <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>}</td>}
                      {geoOn && <td>{rec?.inLoc ? <LocBadge loc={rec.inLoc} /> : <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>}</td>}
                      {anyoneHas(work, db.employees, "requireDevice") && <td>{!rec ? <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span> : rec.checks?.device === "pass" ? <Badge tone="ok"><Check size={10} /> {rec.deviceLabel || "Registered"}</Badge> : <Badge tone="danger"><XCircle size={10} /> Unregistered</Badge>}</td>}
                      {anyoneHas(work, db.employees, "recordIP") && <td style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>{rec?.ip || "—"}</td>}
                      {anyoneHas(work, db.employees, "presenceChecks") && <td>
                        {!rec || boardRows.find((r) => r.e.id === e.id)?.checks.length === 0
                          ? <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>
                          : <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {boardRows.find((r) => r.e.id === e.id).checks.map((c) => (
                                <span key={c.dueTime} title={`${c.dueTime} · ${c.state}`} className={"cp-chk " + c.state} />
                              ))}
                            </div>}
                      </td>}
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{rec?.clockIn && rec?.clockOut ? durLabel(minutesBetween(rec.clockIn, rec.clockOut)) : "—"}</td>
                      <td>{!rec ? <Badge tone={st.tone}>{st.label}</Badge>
                        : rec.status === "review" ? <Badge tone="warn"><ShieldAlert size={10} /> Review</Badge>
                        : rec.status === "rejected" ? <Badge tone="danger"><XCircle size={10} /> Rejected</Badge>
                        : <Badge tone="ok"><CheckCircle2 size={10} /> Approved</Badge>}</td>
                      {isHR && <td>{rec && <button className="cp-mini cp-mini-no" onClick={() => deleteAttendance(rec.id)}><Trash2 size={13} /></button>}</td>}
                    </tr>
                  ))}
                  {boardRows.length === 0 && <tr><td colSpan={9}><Empty text="Nobody to show yet." /></td></tr>}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {tab === "me" && myEmp && (
        <>
          <div className="cp-tiles" style={{ marginBottom: 18 }}>
            <Stat icon={Timer} label="Last 7 days" value={durLabel(weekMins)} sub="Total logged" />
            <Stat icon={Check} label="Days worked" value={myWeek.filter((d) => d.mins != null).length} sub="of the last 7" />
            <Stat icon={Clock3} label="Average day" value={myWeek.filter((d) => d.mins != null).length ? durLabel(Math.round(weekMins / myWeek.filter((d) => d.mins != null).length)) : "—"} tone="accent" />
          </div>
          <Card>
            <Section title="Last 7 days">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {myWeek.map((d) => {
                  const st = attStatus(d.rec, shiftFor(work, myEmp, d.date, db.branches), work.graceMins);
                  return (
                    <div key={d.date} className="cp-leaverow">
                      <div style={{ width: 44, textAlign: "center", flex: "0 0 auto" }}>
                        <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{DAYS[(parseD(d.date).getDay() + 6) % 7]}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600 }}>{parseD(d.date).getDate()}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{d.date === todayISO() ? "Today" : fmtLong(d.date)}</div>
                        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{d.rec ? `${d.rec.clockIn || "—"} – ${d.rec.clockOut || "still in"}` : "No record"}</div>
                        {d.rec?.inLoc && <div style={{ marginTop: 4 }}><LocBadge loc={d.rec.inLoc} /></div>}
                      </div>
                      <Badge tone={st.tone}>{d.mins != null ? durLabel(d.mins) : st.label}</Badge>
                    </div>
                  );
                })}
              </div>
            </Section>
          </Card>
        </>
      )}

      {tab === "history" && (
        <>
          <Card style={{ marginBottom: 18 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              {(isHR || isManager) && (
                <div style={{ minWidth: 200, flex: 1 }}>
                  <Field label="Who">
                    <select className="cp-input" value={histEmp} onChange={(e) => setHistEmp(e.target.value)}>
                      <option value="all">Everyone ({scope.length})</option>
                      {scope.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </Field>
                </div>
              )}
              <div style={{ minWidth: 170 }}>
                <Field label="Month">
                  <select className="cp-input" value={histMonth} onChange={(e) => setHistMonth(e.target.value)}>
                    <option value="all">Last {ATTENDANCE_WINDOW_DAYS} days</option>
                    {monthOptions(12).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                </Field>
              </div>
              <Btn variant="ghost" icon={Download} onClick={exportHistory} disabled={histOutOfWindow && olderHist.loading}>Download CSV</Btn>
            </div>
            {histOutOfWindow && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 10 }}>
                {olderHist.loading ? "Loading that month from the server…" : `Older than the last ${ATTENDANCE_WINDOW_DAYS} days — loaded separately from ${monthLabel(histMonth)}.`}
              </div>
            )}
          </Card>

          <div className="cp-tiles" style={{ marginBottom: 18 }}>
            <Stat icon={CalendarDays} label="Days recorded" value={histRows.length} />
            <Stat icon={Timer} label="Hours worked" value={durLabel(histTotals.minutes)} />
            <Stat icon={Clock3} label="Average day" value={histTotals.days ? durLabel(Math.round(histTotals.minutes / histTotals.days)) : "—"} />
            <Stat icon={AlertTriangle} label="Late arrivals" value={histTotals.late} tone="accent" />
          </div>

          <Card pad={0}>
            {histOutOfWindow && olderHist.loading ? <div style={{ padding: 30 }}><Empty text="Loading…" /></div> :
             histRows.length === 0 ? <div style={{ padding: 30 }}><Empty text="No attendance recorded for that selection." /></div> : (
              <div className="cp-table-wrap">
                <table className="cp-table">
                  <thead><tr>
                    <th>Date</th>{(isHR || isManager) && histEmp === "all" && <th>Employee</th>}
                    <th>In</th><th>Out</th><th>Hours</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {histRows.map((r) => {
                      const e = empById(r.empId);
                      const shift = shiftFor(work, e, r.date, db.branches);
                      const mins = r.clockIn && r.clockOut ? minutesBetween(r.clockIn, r.clockOut) : null;
                      const isLate = r.clockIn && lateMinutesAgainst(shift.start, r.clockIn, work.graceMins) > 0;
                      return (
                        <tr key={r.id}>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{fmtShort(r.date)}</div>
                            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{DAYS[(parseD(r.date).getDay() + 6) % 7]}</div>
                          </td>
                          {(isHR || isManager) && histEmp === "all" && (
                            <td><div style={{ display: "flex", alignItems: "center", gap: 9 }}><EmpAvatar emp={e} size={28} /><span style={{ fontSize: 13 }}>{e?.name || "Unknown"}</span></div></td>
                          )}
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{r.clockIn || "—"}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{r.clockOut || <span style={{ color: "var(--warn)" }}>—</span>}</td>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{mins != null ? durLabel(mins) : "—"}</td>
                          <td>
                            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                              {isLate && <Badge tone="warn">Late</Badge>}
                              {!r.clockOut && r.clockIn && <Badge tone="muted">No clock-out</Badge>}
                              {r.status === "review" && <Badge tone="warn"><ShieldAlert size={10} /> Review</Badge>}
                              {r.status === "rejected" && <Badge tone="danger">Rejected</Badge>}
                              {!isLate && r.clockOut && r.status !== "review" && r.status !== "rejected" && <Badge tone="ok">OK</Badge>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {checkOpen && (
        <PresenceCheckModal dueTime={checkOpen} onClose={() => setCheckOpen(null)} onDone={answerCheck} />
      )}

      {zoom && (
        <Modal title="Clock-in photo" onClose={() => setZoom(null)}>
          <div style={{ textAlign: "center" }}>
            {zoom.selfie && <SelfieThumb path={zoom.selfie} className="cp-zoomshot" />}
            <div style={{ marginTop: 14, fontSize: 13.5, fontWeight: 600 }}>{empById(zoom.empId)?.name}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 3 }}>{fmtLong(zoom.date)} · {zoom.clockIn}{zoom.deviceLabel ? ` · ${zoom.deviceLabel}` : ""}{zoom.ip ? ` · ${zoom.ip}` : ""}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 12 }}>
              {Object.entries(zoom.checks || {}).map(([k, v]) => <CheckPill key={k} name={k} state={v} />)}
              {zoom.inLoc && <LocBadge loc={zoom.inLoc} />}
            </div>
          </div>
        </Modal>
      )}

      {manual && (
        <Modal title="Record attendance" onClose={() => setManual(null)} submitLabel="Save record"
          onSubmit={() => { if (addManualAttendance(manual)) setManual(null); }}>
          <div className="cp-form-grid">
            <Field label="Employee">
              <select className="cp-input" value={manual.empId} onChange={(e) => setManual({ ...manual, empId: e.target.value })}>
                <option value="">— choose —</option>
                {db.employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
            <Field label="Date"><input type="date" className="cp-input" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} /></Field>
            <Field label="Clock in"><input type="time" className="cp-input" value={manual.clockIn} onChange={(e) => setManual({ ...manual, clockIn: e.target.value })} /></Field>
            <Field label="Clock out"><input type="time" className="cp-input" value={manual.clockOut} onChange={(e) => setManual({ ...manual, clockOut: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Field label="Note (optional)"><input className="cp-input" value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} placeholder="e.g. forgot to clock in" /></Field></div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--muted)", display: "flex", gap: 7 }}><Info size={14} /> This replaces any existing record for that person on that date.</div>
        </Modal>
      )}
    </div>
  );
}


export { attStatus, SelfieThumb, CheckPill, SelfieCam, PresenceCheckModal, ClockInModal, ClockCard, LocBadge, AttendancePage };
