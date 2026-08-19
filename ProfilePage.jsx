import { useState } from "react";
import { Camera, FileText, Trash2, Check, Phone, Users, Landmark, ShieldCheck, Lock, Download } from "lucide-react";
import { signedUrl } from "../lib/supabase.js";
import { onboardingChecklist } from "../lib/onboarding.js";
import { EmpAvatar, Badge, Card, Btn, Field, Section, PageHead, Empty } from "../components/ui.jsx";
import { FormGroup } from "./EmployeesPage.jsx";

const DOC_KINDS = [
  { key: "id", label: "ID card / passport" },
  { key: "cert", label: "Certificate" },
  { key: "reference_letter", label: "Reference letter" },
  { key: "other", label: "Other" },
];

function ChecklistCard({ checklist }) {
  if (checklist.requiredTotal === 0) {
    return null; // HR hasn't required anything yet — no need to nag anyone
  }
  const pct = Math.round((checklist.requiredDone / checklist.requiredTotal) * 100);
  return (
    <Card style={{ marginBottom: 18, borderColor: checklist.complete ? "var(--brand)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700 }}>
            {checklist.complete ? "Your profile is complete" : "Finish setting up your profile"}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2 }}>
            {checklist.complete
              ? "HR can see everything they need from you."
              : `${checklist.requiredDone} of ${checklist.requiredTotal} required items done — fill in the rest below.`}
          </div>
        </div>
        <Badge tone={checklist.complete ? "ok" : "warn"}>{pct}%</Badge>
      </div>
      {!checklist.complete && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {checklist.items.filter((i) => i.required && !i.done).map((i) => (
            <Badge key={i.key} tone="warn">{i.label}</Badge>
          ))}
        </div>
      )}
    </Card>
  );
}

function LockedBanner() {
  return (
    <Card style={{ marginBottom: 18, background: "var(--card2)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Lock size={20} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5 }}>Your profile is locked</div>
          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>HR has frozen your details so they can't change without HR knowing. You can still look everything over below — ask HR if something needs correcting.</div>
        </div>
      </div>
    </Card>
  );
}

function AvatarUpload({ emp, onUpload, locked }) {
  const [busy, setBusy] = useState(false);
  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      setBusy(true);
      await onUpload(reader.result);
      setBusy(false);
    };
    reader.readAsDataURL(file);
  };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <EmpAvatar emp={emp} size={72} />
      <div>
        <label className="cp-btn cp-btn-ghost cp-btn-sm" style={{ cursor: locked ? "default" : "pointer", display: "inline-flex", opacity: locked ? 0.6 : 1 }}>
          <Camera size={14} /> {locked ? "Locked by HR" : busy ? "Uploading…" : emp?.avatarPath ? "Change photo" : "Add a photo"}
          <input type="file" accept="image/*" onChange={pick} disabled={busy || locked} style={{ display: "none" }} />
        </label>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>Shown wherever your name appears in Renla.</div>
      </div>
    </div>
  );
}

function DocRow({ doc, onDelete, locked }) {
  const [url, setUrl] = useState("");
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--line)" }}>
      <FileText size={16} style={{ color: "var(--muted)", flex: "0 0 auto" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{DOC_KINDS.find((k) => k.key === doc.kind)?.label || "Document"}</div>
      </div>
      <button className="cp-icon-btn" title="View / download" onClick={async () => { const u = url || await signedUrl("employee-docs", doc.filePath); setUrl(u); if (u) window.open(u, "_blank"); }}>
        <Download size={14} />
      </button>
      {!locked && <button className="cp-icon-btn" title="Remove" onClick={() => onDelete(doc.id)}><Trash2 size={14} /></button>}
    </div>
  );
}

function DocUploader({ onUpload, locked }) {
  const [kind, setKind] = useState("id");
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    await onUpload(file, kind, file.name);
    setBusy(false);
  };
  if (locked) {
    return <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>Uploading new documents is off while your profile is locked.</div>;
  }
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
      <div style={{ minWidth: 200 }}>
        <Field label="Document type">
          <select className="cp-input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {DOC_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
          </select>
        </Field>
      </div>
      <label className="cp-btn cp-btn-primary cp-btn-md" style={{ cursor: "pointer", display: "inline-flex" }}>
        {busy ? "Uploading…" : "Upload file"}
        <input type="file" onChange={pick} disabled={busy} style={{ display: "none" }} />
      </label>
    </div>
  );
}

function ProfilePage({ db, myEmp, saveMyProfile, uploadMyAvatar, uploadMyDocument, deleteMyDocument }) {
  const [personal, setPersonal] = useState({ phone: myEmp?.phone || "", dob: myEmp?.dob || "", gender: myEmp?.gender || "", marital: myEmp?.marital || "", area: myEmp?.area || "" });
  const [contact, setContact] = useState({ emergency: myEmp?.emergency || "", kin: myEmp?.kin || "" });
  const [reference, setReference] = useState({ referenceName: myEmp?.referenceName || "", referencePhone: myEmp?.referencePhone || "", referenceRelationship: myEmp?.referenceRelationship || "" });
  const [bank, setBank] = useState({ nin: myEmp?.nin || "", bvn: myEmp?.bvn || "", tin: myEmp?.tin || "", pension: myEmp?.pension || "", bank: myEmp?.bank || "", acctName: myEmp?.acctName || "", acct: myEmp?.acct || "" });

  if (!myEmp) {
    return <div className="cp-fade"><PageHead title="My profile" /><Card><Empty text="Your login isn't linked to an employee record yet — ask HR to check your invite." /></Card></div>;
  }

  const myDocs = (db.employeeDocs || []).filter((d) => d.empId === myEmp.id);
  const checklist = onboardingChecklist(myEmp, db.onboarding, myDocs);
  const locked = Boolean(myEmp.profileLocked);

  return (
    <div className="cp-fade" style={{ maxWidth: 760 }}>
      <PageHead title="My profile" sub="Your own details — only you and HR can see this page." />

      {locked && <LockedBanner />}

      <ChecklistCard checklist={checklist} />

      <Card style={{ marginBottom: 18 }}>
        <Section title="Photo">
          <AvatarUpload emp={myEmp} onUpload={uploadMyAvatar} locked={locked} />
        </Section>
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <Section title="Personal details" action={<Btn size="sm" variant="ghost" icon={Check} disabled={locked} onClick={() => saveMyProfile(personal)}>Save</Btn>}>
          <div className="cp-form-grid">
            <Field label="Phone"><input className="cp-input" disabled={locked} value={personal.phone} onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} placeholder="+234 …" /></Field>
            <Field label="Date of birth"><input type="date" className="cp-input" disabled={locked} value={personal.dob} onChange={(e) => setPersonal({ ...personal, dob: e.target.value })} /></Field>
            <Field label="Gender"><input className="cp-input" disabled={locked} value={personal.gender} onChange={(e) => setPersonal({ ...personal, gender: e.target.value })} /></Field>
            <Field label="Marital status"><input className="cp-input" disabled={locked} value={personal.marital} onChange={(e) => setPersonal({ ...personal, marital: e.target.value })} /></Field>
            <Field label="Home area"><input className="cp-input" disabled={locked} value={personal.area} onChange={(e) => setPersonal({ ...personal, area: e.target.value })} placeholder="e.g. Lekki, Lagos" /></Field>
          </div>
        </Section>
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <Section title="Emergency contact" action={<Btn size="sm" variant="ghost" icon={Check} disabled={locked} onClick={() => saveMyProfile(contact)}>Save</Btn>}>
          <div className="cp-form-grid">
            <Field label="Emergency contact" hint="Name and phone number"><input className="cp-input" disabled={locked} value={contact.emergency} onChange={(e) => setContact({ ...contact, emergency: e.target.value })} placeholder="e.g. Bola Ade — 080…" /></Field>
            <Field label="Next of kin"><input className="cp-input" disabled={locked} value={contact.kin} onChange={(e) => setContact({ ...contact, kin: e.target.value })} /></Field>
          </div>
        </Section>
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <Section title="Reference" action={<Btn size="sm" variant="ghost" icon={Check} disabled={locked} onClick={() => saveMyProfile(reference)}>Save</Btn>}>
          <div className="cp-form-grid">
            <Field label="Full name"><input className="cp-input" disabled={locked} value={reference.referenceName} onChange={(e) => setReference({ ...reference, referenceName: e.target.value })} /></Field>
            <Field label="Phone"><input className="cp-input" disabled={locked} value={reference.referencePhone} onChange={(e) => setReference({ ...reference, referencePhone: e.target.value })} /></Field>
            <Field label="Relationship"><input className="cp-input" disabled={locked} value={reference.referenceRelationship} onChange={(e) => setReference({ ...reference, referenceRelationship: e.target.value })} placeholder="e.g. Former manager" /></Field>
          </div>
        </Section>
      </Card>

      <Card style={{ marginBottom: 18 }}>
        <Section title="Bank & statutory IDs" action={<Btn size="sm" variant="ghost" icon={Check} disabled={locked} onClick={() => saveMyProfile(bank)}>Save</Btn>}>
          <div className="cp-form-grid">
            <Field label="NIN"><input className="cp-input" disabled={locked} value={bank.nin} onChange={(e) => setBank({ ...bank, nin: e.target.value })} /></Field>
            <Field label="BVN"><input className="cp-input" disabled={locked} value={bank.bvn} onChange={(e) => setBank({ ...bank, bvn: e.target.value.replace(/[^0-9]/g, "").slice(0, 11) })} /></Field>
            <Field label="TIN"><input className="cp-input" disabled={locked} value={bank.tin} onChange={(e) => setBank({ ...bank, tin: e.target.value })} /></Field>
            <Field label="Pension RSA PIN"><input className="cp-input" disabled={locked} value={bank.pension} onChange={(e) => setBank({ ...bank, pension: e.target.value })} /></Field>
            <Field label="Bank"><input className="cp-input" disabled={locked} value={bank.bank} onChange={(e) => setBank({ ...bank, bank: e.target.value })} placeholder="e.g. GTBank" /></Field>
            <Field label="Account name"><input className="cp-input" disabled={locked} value={bank.acctName} onChange={(e) => setBank({ ...bank, acctName: e.target.value })} /></Field>
            <Field label="Account number (NUBAN)"><input className="cp-input" disabled={locked} value={bank.acct} onChange={(e) => setBank({ ...bank, acct: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) })} /></Field>
          </div>
        </Section>
      </Card>

      <Card>
        <Section title="Documents">
          {myDocs.length === 0 ? <Empty text="Nothing uploaded yet." /> : myDocs.map((d) => <DocRow key={d.id} doc={d} onDelete={deleteMyDocument} locked={locked} />)}
          <DocUploader onUpload={uploadMyDocument} locked={locked} />
        </Section>
      </Card>
    </div>
  );
}

export { ProfilePage };
