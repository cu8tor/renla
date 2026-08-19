const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const naira = (n) => "₦" + Number(n || 0).toLocaleString("en-NG");
const grossOf = (e) => { const p = e.pay || {}; return (Number(p.basic) || 0) + (Number(p.transport) || 0) + (Number(p.other) || 0) || Number(e.salary) || 0; };
const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID)
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });
const initials = (n) => (n || "?").trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const parseD = (s) => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => iso(new Date());
const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const fmtShort = (s) => { const d = parseD(s); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : "—"; };
const fmtLong = (s) => { const d = parseD(s); return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : "—"; };
const daysInclusive = (a, b) => { const x = parseD(a), y = parseD(b); if (!x || !y) return 0; return Math.max(1, Math.round((y - x) / 86400000) + 1); };
const DEPT_COLORS = ["#1E6B47", "#2E8B5D", "#5CA97F", "#B08423", "#8A6D1E", "#3D7A87", "#7A5FB0"];
function nextBirthday(dob) {
  const d = parseD(dob); if (!d) return null;
  const t = startOfToday();
  let next = new Date(t.getFullYear(), d.getMonth(), d.getDate());
  if (next < t) next = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate());
  return { diff: Math.round((next - t) / 86400000), label: `${d.getDate()} ${MONTHS[d.getMonth()]}` };
}

/* Copies text to the clipboard and reports whether it actually worked.
   navigator.clipboard.writeText() can silently reject — the tab lost focus,
   the page isn't a secure context, permission was denied, or it's an older
   / embedded browser without the API at all — and callers that fire a
   "Copied!" toast without checking the result end up lying to the user
   (the exact bug this was written to fix: "Copy staff code" always said
   copied even when nothing landed on the clipboard). Falls back to the
   old execCommand("copy") trick, which works in more places than the
   modern API but only if triggered synchronously from the click. */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to the fallback below */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export { MONTHS, naira, grossOf, uid, initials, parseD, iso, todayISO, startOfToday, fmtShort, fmtLong, daysInclusive, DEPT_COLORS, nextBirthday, copyText };
