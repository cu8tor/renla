/* =====================================================================
   offlineQueue.js — lets a clock-in/out survive a dropped connection,
   a reload, or the app being closed before the write to Supabase has
   gone through.

   The rest of the app already applies every change optimistically to
   local state and retries the diff against Supabase on the next write
   (see App.jsx's update()/runSync()) — so a clock-in made with no
   signal already "works" in memory. What's missing is durability: if
   the tab reloads or the phone puts the browser to sleep before
   connectivity returns, that in-memory state is gone and the clock-in
   is lost with no record it ever happened.

   This module closes that gap, but deliberately only for the current
   employee's own attendance rows — not the whole workspace. Attendance
   rows carry a clock time, a GPS point and a photo *path* (not payroll,
   bank details, or other employees' records), so it's reasonable for a
   handful of them to sit in localStorage for a short while. Everything
   else in the app still requires a live connection, same as before.
   ===================================================================== */

const KEY_PREFIX = "renla_pending_att_";

const key = (companyId, empId) => `${KEY_PREFIX}${companyId}_${empId}`;

/* Overwrites the stored pending set for this employee with exactly
   `rows`. Pass an empty array once everything's confirmed synced, to
   clear the cache rather than let stale rows linger. */
function savePendingAttendance(companyId, empId, rows) {
  if (!companyId || !empId || typeof window === "undefined") return;
  try {
    if (!rows || !rows.length) { window.localStorage.removeItem(key(companyId, empId)); return; }
    window.localStorage.setItem(key(companyId, empId), JSON.stringify(rows));
  } catch (e) { /* storage full/unavailable/private-mode — pending state just won't survive a reload */ }
}

function loadPendingAttendance(companyId, empId) {
  if (!companyId || !empId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(companyId, empId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

/* Folds any still-pending rows for this employee back into a freshly
   loaded workspace snapshot, so a manual refresh or app reload can't
   silently drop a clock-in that hasn't synced yet. Pending rows win
   over whatever the server has for that same id, since the server
   hasn't seen them at all. */
function mergePendingAttendance(workspace, companyId, empId) {
  const pendingRows = loadPendingAttendance(companyId, empId);
  if (!pendingRows.length) return workspace;
  return {
    ...workspace,
    attendance: [...pendingRows, ...workspace.attendance.filter((a) => !pendingRows.some((r) => r.id === a.id))],
  };
}

export { savePendingAttendance, loadPendingAttendance, mergePendingAttendance };
