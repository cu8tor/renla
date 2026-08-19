import { useState } from "react";
import { Plus, Download, FileText, Lock, Trash2, Link2 } from "lucide-react";
import { uploadDocument, signedUrl } from "../lib/supabase.js";
import { fmtShort } from "../lib/format.js";
import { Badge, Card, Btn, Field, PageHead, Empty, Modal } from "../components/ui.jsx";

function DocsPage({ db, isHR, addDoc, deleteDoc, toast, companyId }) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [f, setF] = useState({ name: "", cat: "Policies", ver: "v1.0", hrOnly: false, link: "", filePath: "" });
  const visible = db.docs.filter((d) => isHR || !d.hrOnly);
  const cats = [...new Set(visible.map((d) => d.cat))];
  return (
    <div className="cp-fade">
      <PageHead title="Company documents" sub={`${visible.length} files`} action={isHR && <Btn icon={Plus} onClick={() => setOpen(true)}>Add document</Btn>} />
      {visible.length === 0 ? <Card><Empty text="No documents yet." action={isHR && <Btn icon={Plus} onClick={() => setOpen(true)}>Add the first one</Btn>} /></Card> : cats.map((c) => (
        <div key={c} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 10 }}>{c}</div>
          <div className="cp-doc-grid">
            {visible.filter((d) => d.cat === c).map((d) => (
              <Card key={d.id} pad={16}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ width: 38, height: 38, borderRadius: 9, background: "var(--brand-soft)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}><FileText size={18} /></span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.3 }}>{d.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3, fontFamily: "var(--font-mono)" }}>{d.ver} · {fmtShort(d.updated)}</div>
                    {d.hrOnly && <div style={{ marginTop: 5 }}><Badge tone="accent"><Lock size={10} /> HR only</Badge></div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                  {d.filePath
                    ? <button className="cp-download" onClick={async () => {
                        const u = await signedUrl("documents", d.filePath);
                        if (u) window.open(u, "_blank", "noopener");
                        else toast("Couldn't open that file", "danger");
                      }}><Download size={13} /> Open</button>
                    : d.link
                      ? <a className="cp-download" href={d.link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}><Link2 size={13} /> Open</a>
                      : <button className="cp-download" onClick={() => toast("No file attached to this document", "warn")}><Download size={13} /> Open</button>}
                  {isHR && <button className="cp-mini cp-mini-no" onClick={() => deleteDoc(d.id)}><Trash2 size={13} /></button>}
                </div>
              </Card>
            ))}
          </div>
        </div>
      ))}
      {open && (
        <Modal title="Add document" onClose={() => setOpen(false)} submitLabel="Add document"
          onSubmit={() => { if (addDoc(f)) { setOpen(false); setF({ name: "", cat: "Policies", ver: "v1.0", hrOnly: false, link: "", filePath: "" }); } }}>
          <div className="cp-form-grid">
            <Field label="Document name"><input className="cp-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Employee Handbook" /></Field>
            <Field label="Category">
              <input className="cp-input" list="cp-doccats" value={f.cat} onChange={(e) => setF({ ...f, cat: e.target.value })} />
              <datalist id="cp-doccats">{["Policies", "Handbook", "Forms", "Templates", "Health & Safety", "Contracts"].map((c) => <option key={c} value={c} />)}</datalist>
            </Field>
            <Field label="Version"><input className="cp-input" value={f.ver} onChange={(e) => setF({ ...f, ver: e.target.value })} /></Field>
            <Field label="Or paste a link" hint="Google Drive, Dropbox — used only if no file is uploaded"><input className="cp-input" value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://…" /></Field>
          </div>
          <div style={{ marginTop: 16 }}>
            <Field label="Upload the file" hint="Stored privately — only your company can open it">
              <input type="file" className="cp-input" disabled={uploading}
                onChange={async (e) => {
                  const file = e.target.files && e.target.files[0];
                  if (!file) return;
                  if (file.size > 25 * 1024 * 1024) { toast("That file is over 25 MB", "warn"); return; }
                  setUploading(true);
                  try {
                    const path = await uploadDocument(file, companyId);
                    setF((x) => ({ ...x, filePath: path, name: x.name || file.name.replace(/\.[^.]+$/, "") }));
                    toast("File uploaded");
                  } catch (err) { toast(err.message || "Upload failed", "danger"); }
                  setUploading(false);
                }} />
            </Field>
            {f.filePath && <div style={{ fontSize: 12, color: "var(--brand)", fontWeight: 600, marginTop: 6 }}>File attached ✓</div>}
          </div>
          <label style={{ display: "flex", gap: 9, alignItems: "center", marginTop: 16, fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" checked={f.hrOnly} onChange={(e) => setF({ ...f, hrOnly: e.target.checked })} />
            Hide from everyone except HR Admins
          </label>
        </Modal>
      )}
    </div>
  );
}


export { DocsPage };
