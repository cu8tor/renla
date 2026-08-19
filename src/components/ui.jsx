import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { initials } from "../lib/format.js";
import { signedUrl } from "../lib/supabase.js";

// `photo`, if given, is an already-resolved signed URL (see EmpAvatar
// below) — Avatar itself stays synchronous and just falls back to
// initials when there isn't one, so it's still safe to use anywhere a
// person's name is shown but there's no employee record to look a
// photo up from (e.g. a news post's free-text author name).
function Avatar({ name, size = 36, tone = "brand", photo }) {
  const bg = tone === "brand" ? "var(--brand-soft)" : "var(--accent-soft)";
  const fg = tone === "brand" ? "var(--brand)" : "var(--accent)";
  if (photo) {
    return <img src={photo} alt={name || ""} style={{ width: size, height: size, borderRadius: size, objectFit: "cover", flex: "0 0 auto" }} />;
  }
  return <div style={{ width: size, height: size, borderRadius: size, background: bg, color: fg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: size * 0.38, flex: "0 0 auto" }}>{initials(name)}</div>;
}

// The usual way to render a person's avatar when a full employee record
// is available: pass the employee object and this resolves their
// avatarPath (if any) to a signed URL and renders Avatar with it,
// falling back to initials while loading or if they don't have a photo.
// signedUrl() already caches for most of an hour, so re-rendering the
// same employee elsewhere on the page doesn't refetch.
function EmpAvatar({ emp, size = 36, tone = "brand" }) {
  const path = emp?.avatarPath;
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(""); return; }
    signedUrl("avatars", path).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [path]);
  return <Avatar name={emp?.name} size={size} tone={tone} photo={url} />;
}
function Badge({ children, tone = "muted" }) {
  const map = { ok: ["var(--ok-soft)", "var(--ok)"], warn: ["var(--warn-soft)", "var(--warn)"], danger: ["var(--danger-soft)", "var(--danger)"], brand: ["var(--brand-soft)", "var(--brand)"], accent: ["var(--accent-soft)", "var(--accent)"], muted: ["var(--card2)", "var(--muted)"] };
  const [bg, fg] = map[tone] || map.muted;
  return <span className="cp-badge" style={{ background: bg, color: fg }}>{children}</span>;
}
function Card({ children, style, pad = 20, className = "" }) {
  return <div className={"cp-card " + className} style={{ padding: pad, ...style }}>{children}</div>;
}
function Btn({ children, onClick, variant = "primary", size = "md", icon: Icon, disabled, type }) {
  return <button type={type || "button"} className={`cp-btn cp-btn-${variant} cp-btn-${size}`} onClick={onClick} disabled={disabled}>{Icon && <Icon size={size === "sm" ? 14 : 16} />}{children}</button>;
}
function Stat({ icon: Icon, label, value, sub, tone = "brand" }) {
  return (
    <Card pad={18}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 500 }}>{label}</span>
        <span className="cp-stat-ic" style={{ background: tone === "accent" ? "var(--accent-soft)" : "var(--brand-soft)", color: tone === "accent" ? "var(--accent)" : "var(--brand)" }}><Icon size={16} /></span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 27, fontWeight: 600, marginTop: 10, letterSpacing: "-0.02em" }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>}
    </Card>
  );
}
function Field({ label, children, hint }) {
  return (
    <label style={{ display: "block" }}>
      <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--muted)", marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 11.5, color: "var(--muted)", marginTop: 4 }}>{hint}</span>}
    </label>
  );
}
function KV({ icon: Icon, k, v, mono }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
      {Icon && <Icon size={15} style={{ color: "var(--muted)", marginTop: 2, flex: "0 0 auto" }} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: "var(--muted)", fontWeight: 500 }}>{k}</div>
        <div style={{ fontSize: 13.5, fontWeight: 500, fontFamily: mono ? "var(--font-mono)" : "inherit", wordBreak: "break-word" }}>{v || "—"}</div>
      </div>
    </div>
  );
}
function Section({ title, action, children }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, letterSpacing: "-0.01em", margin: 0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}
function PageHead({ title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
      <div>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>{title}</h2>
        {sub && <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 3 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}
function Empty({ text, action }) {
  return <div style={{ padding: "26px 4px", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>{text}{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>;
}
function Dot({ c }) { return <span style={{ width: 8, height: 8, borderRadius: 8, background: c, display: "inline-block" }} />; }
function Modal({ title, children, onClose, onSubmit, submitLabel, wide }) {
  return (
    <div className="cp-modal-wrap" onClick={onClose}>
      <div className={"cp-modal" + (wide ? " wide" : "")} onClick={(e) => e.stopPropagation()}>
        <div className="cp-modal-head">
          <h3 style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, margin: 0 }}>{title}</h3>
          <button className="cp-icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="cp-modal-body">{children}</div>
        {onSubmit && (
          <div className="cp-modal-foot">
            <button className="cp-btn cp-btn-ghost cp-btn-md" onClick={onClose}>Cancel</button>
            <button className="cp-btn cp-btn-primary cp-btn-md" onClick={onSubmit}>{submitLabel}</button>
          </div>
        )}
      </div>
    </div>
  );
}

export { Avatar, EmpAvatar, Badge, Card, Btn, Stat, Field, KV, Section, PageHead, Empty, Dot, Modal };
