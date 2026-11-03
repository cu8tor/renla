/* =====================================================================
   What kind of business this is.

   Asked once at signup, and the reason is product decisions rather than
   record-keeping. A security firm with forty guards on night posts and
   a salon with three stylists both "need attendance", and almost nothing
   about what they need is the same — rotas, overtime, GPS, selfies,
   leave accrual and payroll all pull in different directions depending
   on the trade.

   The list is deliberately finer-grained than it needs to be today.
   Categories can always be grouped together later; they can never be
   split apart after the fact, because the detail was never collected.

   Stored as the key. Labels can be reworded without touching the data,
   and the key stays stable so counts stay comparable over time.
   ===================================================================== */

export const INDUSTRIES = [
  { key: "retail",        label: "Retail & shops" },
  { key: "food",          label: "Restaurants, bars & catering" },
  { key: "hospitality",   label: "Hotels & hospitality" },
  { key: "beauty",        label: "Salons, spas & barbing" },
  { key: "health",        label: "Clinics, pharmacies & health" },
  { key: "education",     label: "Schools & training" },
  { key: "logistics",     label: "Logistics, transport & dispatch" },
  { key: "security",      label: "Security services" },
  { key: "manufacturing", label: "Manufacturing & production" },
  { key: "construction",  label: "Construction & engineering" },
  { key: "fashion",       label: "Fashion, tailoring & textiles" },
  { key: "agriculture",   label: "Agriculture & agro-processing" },
  { key: "professional",  label: "Professional services" },
  { key: "technology",    label: "Technology & software" },
  { key: "media",         label: "Media, events & creative" },
  { key: "facilities",    label: "Cleaning & facility management" },
  { key: "finance",       label: "Finance, lending & insurance" },
  { key: "ngo",           label: "NGO & nonprofit" },
  { key: "other",         label: "Something else" },
];

const BY_KEY = new Map(INDUSTRIES.map((i) => [i.key, i.label]));

/* Shows an unrecognised key as itself rather than hiding it: a company
   set by hand, or one whose category was renamed, should still read as
   something rather than as nothing. */
export function industryLabel(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  return BY_KEY.get(k) || k;
}

export function isIndustry(key) {
  return BY_KEY.has(String(key || "").trim());
}
