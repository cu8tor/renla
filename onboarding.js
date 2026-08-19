/* =====================================================================
   onboarding.js — the single source of truth for "which fields does HR
   require every staff member to fill in, and has this particular person
   filled them in yet." Used by both the employee-facing My Profile page
   (to know what to ask for / mark required) and the HR-facing side
   (Settings' checklist that controls this, and the Dashboard/Employees
   "who's still got gaps" views) — one definition, so the two can never
   drift out of sync with each other.
   ===================================================================== */

// All off by default — turning this on for an existing company doesn't
// suddenly mark everyone's profile "incomplete" until HR opts in.
const DEFAULT_ONBOARDING = {
  requireEmergency: false,
  requireKin: false,
  requireReference: false,
  requireBank: false,
  requireNin: false,
  requireBvn: false,
  requirePhoto: false,
  requireIdDocument: false,
};

// Each item: the onboarding-settings key that makes it required, a
// label for the checklist UI, and how to tell if a given employee has
// actually filled it in. `docs` is that employee's own rows from
// db.employeeDocs (already filtered by empId).
const ITEMS = [
  { key: "requireEmergency", label: "Emergency contact", done: (e) => Boolean(e.emergency?.trim()) },
  { key: "requireKin", label: "Next of kin", done: (e) => Boolean(e.kin?.trim()) },
  { key: "requireReference", label: "A named reference", done: (e) => Boolean(e.referenceName?.trim() && e.referencePhone?.trim()) },
  { key: "requireBank", label: "Bank account details", done: (e) => Boolean(e.bank?.trim() && e.acct?.trim()) },
  { key: "requireNin", label: "NIN", done: (e) => Boolean(e.nin?.trim()) },
  { key: "requireBvn", label: "BVN", done: (e) => Boolean(e.bvn?.trim()) },
  { key: "requirePhoto", label: "Profile picture", done: (e) => Boolean(e.avatarPath) },
  { key: "requireIdDocument", label: "An ID or reference document", done: (e, docs) => (docs || []).length > 0 },
];

// Returns { items: [{label, done, required}], requiredTotal, requiredDone,
// complete } — `items` includes every field regardless of whether it's
// required, so the profile page can still show optional ones; `complete`
// only looks at the ones HR actually ticked as required.
function onboardingChecklist(emp, cfg, docs) {
  const settings = { ...DEFAULT_ONBOARDING, ...(cfg || {}) };
  const items = ITEMS.map((it) => ({
    key: it.key, label: it.label,
    required: Boolean(settings[it.key]),
    done: it.done(emp || {}, docs),
  }));
  const required = items.filter((i) => i.required);
  const requiredDone = required.filter((i) => i.done).length;
  return { items, requiredTotal: required.length, requiredDone, complete: required.every((i) => i.done) };
}

export { DEFAULT_ONBOARDING, onboardingChecklist };
