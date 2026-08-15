import { useState } from "react";
import { Plus, Pin, Heart, Trash2 } from "lucide-react";
import { fmtShort } from "../lib/format.js";
import { Avatar, Badge, Card, Btn, Field, PageHead, Empty, Modal } from "../components/ui.jsx";

function NewsPage({ db, isHR, publishPost, toggleLike, togglePin, deletePost }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ title: "", body: "", category: "Announcement" });
  const sorted = [...db.news].sort((a, b) => (b.pinned === a.pinned ? 0 : b.pinned ? 1 : -1));
  return (
    <div className="cp-fade">
      <PageHead title="Company news" sub={`${db.news.length} updates`} action={isHR && <Btn icon={Plus} onClick={() => setOpen(true)}>Publish update</Btn>} />
      {db.news.length === 0 ? <Card><Empty text="No updates yet." action={isHR && <Btn icon={Plus} onClick={() => setOpen(true)}>Publish the first one</Btn>} /></Card> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 720 }}>
          {sorted.map((p) => (
            <Card key={p.id}>
              <div style={{ display: "flex", gap: 12 }}>
                <Avatar name={p.author} size={40} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.author}</span>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>· {p.role} · {fmtShort(p.date)}</span>
                    <Badge tone="brand">{p.category}</Badge>
                    {p.pinned && <Badge tone="accent"><Pin size={10} /> Pinned</Badge>}
                  </div>
                  <h4 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, margin: "8px 0 6px" }}>{p.title}</h4>
                  <p style={{ fontSize: 13.5, opacity: 0.85, lineHeight: 1.55, margin: 0, whiteSpace: "pre-wrap" }}>{p.body}</p>
                  <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center" }}>
                    <button className="cp-react" onClick={() => toggleLike(p.id)} style={{ color: p.liked ? "var(--brand)" : "var(--muted)" }}>
                      <Heart size={14} fill={p.liked ? "var(--brand)" : "none"} /> {p.likes}
                    </button>
                    {isHR && <button className="cp-react" onClick={() => togglePin(p.id)} style={{ color: "var(--muted)" }}><Pin size={14} /> {p.pinned ? "Unpin" : "Pin"}</button>}
                    {isHR && <button className="cp-react" onClick={() => deletePost(p.id)} style={{ color: "var(--danger)" }}><Trash2 size={14} /> Delete</button>}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
      {open && (
        <Modal title="Publish update" onClose={() => setOpen(false)} submitLabel="Publish"
          onSubmit={() => { if (publishPost(f)) { setOpen(false); setF({ title: "", body: "", category: "Announcement" }); } }}>
          <Field label="Category">
            <select className="cp-input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
              {["Announcement", "Policy", "Benefits", "Event", "Notice"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <div style={{ marginTop: 14 }}><Field label="Title"><input className="cp-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="What's the news?" /></Field></div>
          <div style={{ marginTop: 14 }}><Field label="Message"><textarea className="cp-input" rows={5} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field></div>
        </Modal>
      )}
    </div>
  );
}


export { NewsPage };
