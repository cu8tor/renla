import { Trophy, Flame, Info } from "lucide-react";
import { computeLeaderboard } from "../lib/leaderboard.js";
import { monthKey, monthLabel } from "../lib/payrollHelpers.js";
import { EmpAvatar, Badge, Card, Stat, PageHead, Empty, Btn } from "../components/ui.jsx";

// Gold / silver / bronze tint for the top 3 rows — everyone below that
// just gets their plain rank number. Deliberately no "worst" styling
// anywhere on this page — see leaderboard.js's file header for why.
const MEDAL = { 1: "#caa131", 2: "#9aa1ab", 3: "#b3742e" };

function earlyLabel(mins) {
  const r = Math.round(mins);
  if (r > 0) return `${r}m early`;
  if (r < 0) return `${Math.abs(r)}m late`;
  return "On time";
}

function LeaderboardPage({ db, myEmp, isHR, go }) {
  const mKey = monthKey(new Date());
  const enabled = Boolean(db.leaderboard?.enabled);

  if (!enabled) {
    return (
      <div className="cp-fade" style={{ maxWidth: 760 }}>
        <PageHead title="Leaderboard" sub="A fun, optional ranking of who clocks in earliest each month" />
        <Card>
          <Empty
            text={isHR
              ? "The punctuality leaderboard is off for your company. Turn it on from Settings to let everyone see who's earliest this month."
              : "The punctuality leaderboard isn't turned on for your company yet — ask HR if you'd like to see it."}
            action={isHR ? <Btn onClick={() => go("settings")}>Go to Settings</Btn> : null}
          />
        </Card>
      </div>
    );
  }

  const ranked = computeLeaderboard({ employees: db.employees, attendance: db.attendance, work: db.work, branches: db.branches, monthKey: mKey });
  const myRank = myEmp ? ranked.find((r) => r.empId === myEmp.id) : null;
  const notYetRanked = (db.employees || []).filter((e) => (!e.status || e.status === "Active")).length - ranked.length;
  const empById = Object.fromEntries((db.employees || []).map((e) => [e.id, e]));

  return (
    <div className="cp-fade" style={{ maxWidth: 900 }}>
      <PageHead title="Leaderboard" sub={`Ranked by average minutes early this month, against everyone's own schedule — ${monthLabel(mKey)}`} />

      <div className="cp-tiles" style={{ marginBottom: 18 }}>
        <Stat icon={Trophy} label="Top this month" value={ranked[0]?.name || "—"} sub={ranked[0] ? earlyLabel(ranked[0].avgEarly) : "Not enough data yet"} tone="brand" />
        <Stat icon={Flame} label="Your rank" value={myRank ? `#${myRank.rank}` : "—"} sub={myRank ? earlyLabel(myRank.avgEarly) : "Not ranked yet — clock in a few more days"} />
        <Stat icon={Info} label="People ranked" value={ranked.length} sub={notYetRanked > 0 ? `${notYetRanked} not ranked yet` : "Everyone with enough data"} />
      </div>

      <Card>
        <div className="cp-table-wrap">
          <table className="cp-table">
            <thead><tr><th>Rank</th><th>Employee</th><th>Streak</th><th>Days tracked</th><th>Average</th></tr></thead>
            <tbody>
              {ranked.map((r) => (
                <tr key={r.empId} style={myEmp && r.empId === myEmp.id ? { background: "var(--brand-soft)" } : undefined}>
                  <td>
                    {r.rank <= 3
                      ? <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, color: MEDAL[r.rank] }}><Trophy size={15} /> {r.rank}</span>
                      : <span style={{ color: "var(--muted)" }}>{r.rank}</span>}
                  </td>
                  <td><div style={{ display: "flex", alignItems: "center", gap: 11 }}><EmpAvatar emp={empById[r.empId]} size={32} /><div><div style={{ fontWeight: 600, fontSize: 13.5 }}>{r.name}</div><div style={{ fontSize: 12, color: "var(--muted)" }}>{r.title || "—"}</div></div></div></td>
                  <td>{r.streak > 1 ? <Badge tone="ok"><Flame size={10} /> {r.streak}-day streak</Badge> : <span style={{ fontSize: 12, color: "var(--muted)" }}>—</span>}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{r.days}</td>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: r.avgEarly >= 0 ? "var(--ok)" : "var(--muted)" }}>{earlyLabel(r.avgEarly)}</td>
                </tr>
              ))}
              {ranked.length === 0 && <tr><td colSpan={5}><Empty text="Nobody's clocked in enough days yet this month to be ranked." /></td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export { LeaderboardPage };
