import { Badge, Empty } from "./ui.jsx";
import { naira } from "../lib/format.js";
import { withRunningBalance, prettyWhat } from "../features/billing/status.js";

/* =====================================================================
   Statement — the ledger, read by a human.

   One component for both the customer's billing page and Renla's admin
   view, because two statements of the same money that disagreed about a
   figure would be worse than either.

   The running balance is the point. A list of charges and payments
   tells you what happened; only the balance column tells you where each
   one left you, which is what somebody querying a bill actually asks.
   ===================================================================== */

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function Statement({ entries, showKind = false, showReference = false, empty }) {
  const rows = withRunningBalance(entries);
  if (rows.length === 0) return <Empty text={empty || "Nothing yet — no payments and no charges."} />;

  return (
    <div className="cp-table-wrap">
      <table className="cp-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>What</th>
            {showReference && <th>Reference</th>}
            <th className="cp-num">Amount</th>
            <th className="cp-num">Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const amt = Number(e.amount) || 0;
            const after = Number(e.balanceAfter) || 0;
            return (
              <tr key={e.id}>
                <td style={{ fontSize: 12.5, whiteSpace: "nowrap", color: "var(--muted)" }}>
                  {fmtDate(e.createdAt)}
                </td>
                <td style={{ fontSize: 13 }}>
                  {showKind && (
                    <Badge tone={e.kind === "credit" ? "ok" : e.kind === "charge" ? "muted" : "accent"}>
                      {e.kind}
                    </Badge>
                  )}
                  <span style={{ marginLeft: showKind ? 8 : 0 }}>{prettyWhat(e.description)}</span>
                </td>
                {showReference && (
                  <td style={{ fontSize: 12.5, color: "var(--muted)" }}>{e.reference || "—"}</td>
                )}
                {/* A charge is not less important than a payment, so it
                    isn't greyed out — only the sign distinguishes them. */}
                <td className="cp-num" style={{ fontWeight: 600, color: amt < 0 ? "var(--ink)" : "var(--ok)" }}>
                  {amt < 0 ? "−" : "+"}{naira(Math.abs(amt))}
                </td>
                <td className="cp-num" style={{ color: after < 0 ? "var(--danger)" : "var(--muted)" }}>
                  {after < 0 ? "−" : ""}{naira(Math.abs(after))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
