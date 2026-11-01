import { useState } from "react";
import { Check, ArrowRight, Timer } from "lucide-react";
import { onboardingChecklist } from "../lib/onboarding.js";
import { Card, Btn, Field, Section, PageHead, Empty } from "../components/ui.jsx";

/* =====================================================================
   WelcomePage — the step straight after joining.

   Dropping a brand-new employee on the dashboard and hoping they find
   "My profile" is how HR ends up chasing people for a bank account the
   week payroll is due. This asks for exactly what HR ticked under
   Settings → Employee onboarding, once, while the person is already
   in the flow of setting up.

   It asks for nothing else. Every field here is one HR actually
   requires; anything optional belongs on the profile page, where
   people can get to it in their own time.
   ===================================================================== */

// The onboarding items that are a plain text field on the employee
// record, and what to call them when we're asking the person directly
// rather than listing them to HR.
const FIELD_FOR = {
  requireEmergency: { label: "Emergency contact", hint: "Name and phone number", keys: ["emergency"], placeholder: "e.g. Bola Ade — 080…" },
  requireKin: { label: "Next of kin", keys: ["kin"] },
  requireBank: { label: "Bank details", keys: ["bank", "acctName", "acct"] },
  requireNin: { label: "NIN", keys: ["nin"] },
  requireBvn: { label: "BVN", keys: ["bvn"] },
  requireReference: { label: "A reference", keys: ["referenceName", "referencePhone", "referenceRelationship"] },
};

const SUB_LABEL = {
  bank: "Bank", acctName: "Account name", acct: "Account number (NUBAN)",
  referenceName: "Full name", referencePhone: "Phone", referenceRelationship: "Relationship",
  emergency: "Emergency contact", kin: "Next of kin", nin: "NIN", bvn: "BVN",
};

const digitsOnly = (v, max) => v.replace(/[^0-9]/g, "").slice(0, max);

export default function WelcomePage({ db, myEmp, saveMyProfile, go }) {
  const myDocs = myEmp ? (db.employeeDocs || []).filter((d) => d.empId === myEmp.id) : [];
  const checklist = myEmp ? onboardingChecklist(myEmp, db.onboarding, myDocs) : null;

  // Only the outstanding items, and only the ones that are a form field —
  // a profile photo and an ID document are uploads, which belong on the
  // profile page rather than in a first-run form.
  const todo = (checklist?.items || []).filter((i) => i.required && !i.done && FIELD_FOR[i.key]);

  const [f, setF] = useState(() => {
    const init = {};
    todo.forEach(({ key }) => FIELD_FOR[key].keys.forEach((k) => { init[k] = myEmp?.[k] || ""; }));
    return init;
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  const done = () => go("dashboard");

  const save = () => {
    setBusy(true);
    saveMyProfile(f);
    setBusy(false);
    done();
  };

  const first = (myEmp?.name || "").split(" ")[0];

  if (!myEmp) {
    return (
      <div className="cp-fade" style={{ maxWidth: 620 }}>
        <PageHead title="Welcome to Renla" />
        <Card><Empty text="Your login isn't linked to an employee record yet — ask HR to check your invite." /></Card>
      </div>
    );
  }

  // Nothing required, or it's all filled in already: don't manufacture a
  // step just to have one.
  if (todo.length === 0) {
    return (
      <div className="cp-fade" style={{ maxWidth: 620 }}>
        <PageHead title={first ? `You're all set, ${first}` : "You're all set"}
          sub="Nothing else is needed from you right now." />
        <Card>
          <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span style={{ width: 34, height: 34, borderRadius: 9, background: "var(--ok-soft)", color: "var(--ok)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
              <Check size={17} />
            </span>
            <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
              Your account is ready. You can add a photo and the rest of your details any time from <b>My profile</b>.
            </div>
          </div>
          <div style={{ marginTop: 18 }}><Btn icon={ArrowRight} onClick={done}>Go to my dashboard</Btn></div>
        </Card>
      </div>
    );
  }

  return (
    <div className="cp-fade" style={{ maxWidth: 620 }}>
      <PageHead title={first ? `Welcome, ${first}` : "Welcome to Renla"}
        sub={`${db.company?.name || "Your employer"} needs a few details from you. This is the last step.`} />

      <Card>
        <Section title={`${todo.length} ${todo.length === 1 ? "thing" : "things"} to fill in`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {todo.map(({ key }) => {
              const spec = FIELD_FOR[key];
              return (
                <div key={key}>
                  {spec.keys.length === 1 ? (
                    <Field label={spec.label} hint={spec.hint}>
                      <input className="cp-input" value={f[spec.keys[0]] || ""}
                        placeholder={spec.placeholder}
                        onChange={(e) => {
                          const k = spec.keys[0];
                          const v = k === "bvn" ? digitsOnly(e.target.value, 11) : e.target.value;
                          set(k, v);
                        }} />
                    </Field>
                  ) : (
                    <>
                      <div className="cp-slip-head" style={{ marginBottom: 8 }}>{spec.label}</div>
                      <div className="cp-form-grid">
                        {spec.keys.map((k) => (
                          <Field key={k} label={SUB_LABEL[k] || k}>
                            <input className="cp-input" value={f[k] || ""}
                              onChange={(e) => set(k, k === "acct" ? digitsOnly(e.target.value, 10) : e.target.value)} />
                          </Field>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 20, flexWrap: "wrap" }}>
            <Btn icon={busy ? Timer : Check} disabled={busy} onClick={save}>
              {busy ? "Saving…" : "Save and continue"}
            </Btn>
            {/* Never trap anyone in this form. A missing detail is a
                nudge on the dashboard, not a locked door. */}
            <button className="cp-link" onClick={done}>I'll do this later</button>
          </div>
        </Section>
      </Card>
    </div>
  );
}
