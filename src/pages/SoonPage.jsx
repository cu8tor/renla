import { Badge, Card, PageHead } from "../components/ui.jsx";

function SoonPage({ item }) {
  const copy = {
    payroll: "Nigerian payroll — PAYE, pension (RSA) and statutory deductions — is scoped for a later phase. The first decision is build vs. integrate a licensed payroll provider; everything around it gets proven first.",
    attendance: "Clock in / out, then GPS geofencing, lands in Phase 2. Starting simple keeps the core shippable.",
    rota: "Shift scheduling with a weekly rota and swap requests comes in Phase 2.",
    performance: "KPIs, quarterly reviews and manager feedback are planned for Phase 4 once the core is proven.",
  };
  return (
    <div className="cp-fade" style={{ maxWidth: 560 }}>
      <PageHead title={item.label} sub={item.phase} />
      <Card pad={32} style={{ textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 14, background: "var(--brand-soft)", color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><item.icon size={26} /></div>
        <h3 style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, margin: "0 0 8px" }}>{item.label} — {item.phase}</h3>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6, maxWidth: 400, margin: "0 auto" }}>{copy[item.key]}</p>
        <div style={{ marginTop: 18 }}><Badge tone="brand">Deliberately deferred</Badge></div>
      </Card>
    </div>
  );
}


export { SoonPage };
