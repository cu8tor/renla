import { Users, CalendarDays, Clock3, ChevronRight, Cake, Pin, PartyPopper, Users2, BadgeCheck, UserPlus, Timer, AlertTriangle, ShieldAlert, Banknote } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, PieChart, Pie } from "recharts";
import { durLabel, shiftFor, lateMinutesAgainst } from "../features/attendance/attendanceLogic.js";
import { MONTHS, naira, parseD, todayISO, startOfToday, fmtShort, fmtLong, DEPT_COLORS } from "../lib/format.js";
import { isOnLeaveToday, monthInsights, branchBreakdown } from "../features/insights/monthInsights.js";
import { monthKey, monthLabel } from "../lib/payrollHelpers.js";
import { Avatar, Badge, Card, Stat, Section, Empty, Dot } from "../components/ui.jsx";
import { LeaveDecideRow } from "./LeavePage.jsx";

// Turns the numbers this person actually cares about right now into a
// short, scannable status line under the greeting — "3 late today, 2
// leave requests waiting" rather than making them go find that out from
// the stat tiles below. Only ever states things that are true of data
// that exists (no invented "payroll due" date — there's no pay-day field
// in the schema, so this reports the one honest proxy: whether the
// current month's run has been finalised yet, and only once that's
// actually getting urgent).
function narrativeLine({ isHR, isManager, myEmp, db, myTeam, pendingForMe, onLeaveNow, upcomingHols, myLeave }) {
  const today = todayISO();
  const parts = [];
  if (isHR || isManager) {
    const scope = isHR ? db.employees : myTeam;
    const lateToday = scope.filter((e) => {
      const rec = db.attendance.find((a) => a.empId === e.id && a.date === today);
      if (!rec || !rec.clockIn) return false;
      const shift = shiftFor(db.work, e, today, db.branches);
      return lateMinutesAgainst(shift.start, rec.clockIn, db.work.graceMins || 0) > 0;
    }).length;
    if (lateToday > 0) parts.push(`${lateToday} ${lateToday === 1 ? "person" : "people"} late today`);
    if (pendingForMe.length > 0) parts.push(`${pendingForMe.length} leave ${pendingForMe.length === 1 ? "request" : "requests"} waiting on you`);
    if (isHR && onLeaveNow.length > 0) parts.push(`${onLeaveNow.length} on leave`);
    if (isHR) {
      const now = new Date();
      const mKey = monthKey(now);
      const run = db.payruns.find((r) => r.month === mKey);
      const daysLeft = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
      if ((!run || run.status !== "finalised") && daysLeft <= 10)
        parts.push(`payroll for ${monthLabel(mKey)} ${run ? "still a draft" : "not started"} — ${daysLeft}d left in the month`);
    }
  } else if (myEmp) {
    const mine = (myLeave || []).filter((l) => l.status.startsWith("pending"));
    if (mine.length > 0) parts.push(`${mine.length} of your ${mine.length === 1 ? "request is" : "requests are"} still pending`);
    if (upcomingHols[0] && upcomingHols[0].diff <= 7) parts.push(`${upcomingHols[0].name} in ${upcomingHols[0].diff}d`);
  }
  return parts.length ? parts.join(" · ") : "here's where things stand.";
}

function DashboardPage({ me, myEmp, isHR, isManager, myTeam, total, presentNow, onLeaveNow, pendingForMe, upcomingBdays, upcomingHols, deptData, db, theme, empById, decideLeave, go, employees }) {
  const hr = new Date().getHours();
  const greeting = hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening";
  const myLeave = myEmp ? db.leave.filter((l) => l.empId === myEmp.id) : [];
  const narrative = narrativeLine({ isHR, isManager, myEmp, db, myTeam, pendingForMe, onLeaveNow, upcomingHols, myLeave });
  return (
    <div className="cp-fade">
      <div style={{ marginBottom: 22 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>{greeting}, {me.name.split(" ")[0]}</h2>
        <p style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 4 }}>{fmtLong(todayISO())} · {narrative}</p>
      </div>

      <div className="cp-tiles">
        {isHR && <>
          <Stat icon={Users} label="Total employees" value={total} sub={`${deptData.length} departments`} />
          <Stat icon={Timer} label="Clocked in now" value={db.attendance.filter((a) => a.date === todayISO() && a.clockIn && !a.clockOut).length} sub="Currently working" />
          <Stat icon={CalendarDays} label="On leave today" value={onLeaveNow.length} sub={onLeaveNow.map((e) => e.name.split(" ")[0]).join(", ") || "Nobody"} tone="accent" />
          <Stat icon={Clock3} label="Awaiting your sign-off" value={pendingForMe.length} sub="Leave requests" tone="accent" />
        </>}
        {isManager && <>
          <Stat icon={Users2} label="My team" value={myTeam.length} sub={myTeam.map((m) => m.name.split(" ")[0]).join(", ") || "Nobody assigned yet"} />
          <Stat icon={BadgeCheck} label="Present today" value={myTeam.filter((m) => !isOnLeaveToday(db.leave, m.id)).length} sub="of your team" />
          <Stat icon={Clock3} label="Awaiting approval" value={pendingForMe.length} sub="From your team" tone="accent" />
          <Stat icon={Cake} label="Team birthdays" value={upcomingBdays.filter((b) => myTeam.some((m) => m.id === b.e.id)).length} sub="Next 30 days" tone="accent" />
        </>}
        {!isHR && !isManager && myEmp && <>
          <Stat icon={CalendarDays} label="Annual leave left" value={`${myEmp.bal.annual} days`} />
          <Stat icon={BadgeCheck} label="Sick days left" value={`${myEmp.bal.sick} days`} />
          <Stat icon={Clock3} label="My open requests" value={myLeave.filter((l) => l.status.startsWith("pending")).length} sub="Awaiting approval" tone="accent" />
          <Stat icon={PartyPopper} label="Next holiday" value={upcomingHols[0] ? `${upcomingHols[0].diff}d` : "—"} sub={upcomingHols[0]?.name} tone="accent" />
        </>}
      </div>

      {(isHR || isManager) && (() => {
        const mKey = monthKey(new Date());
        const scope = isHR ? db.employees : myTeam;
        if (!scope.length) return null;
        const ins = monthInsights(db, scope, mKey);
        const branches = isHR ? branchBreakdown(db, db.employees, mKey) : [];
        return (
          <Card style={{ marginTop: 18 }}>
            <Section title={`This month · ${monthLabel(mKey)}`}>
              <div className="cp-tiles" style={{ marginBottom: 18 }}>
                <Stat icon={AlertTriangle} label="Late arrivals" value={ins.lateArrivals} sub={durLabel(ins.lateMinutes) + " lost"} tone="accent" />
                <Stat icon={Banknote} label="Cost of absence" value={naira(ins.absenceCost)} sub="Unexplained + unpaid days" tone="accent" />
                <Stat icon={Timer} label="Overtime" value={durLabel(ins.overtimeMins)} sub={db.payroll?.payOvertime ? naira(ins.overtimeCost) : "Not paid"} />
                <Stat icon={BadgeCheck} label="Attendance" value={ins.attendancePct != null ? ins.attendancePct + "%" : "—"} sub={`${ins.missingClockOuts} missing clock-outs`} />
              </div>

              <div className="cp-two-col">
                <div>
                  <div className="cp-slip-head">Most punctual</div>
                  {ins.mostPunctual.length === 0 ? <Empty text="No attendance recorded yet this month." /> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {ins.mostPunctual.slice(0, 10).map((x, i) => (
                        <div key={x.emp.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ width: 20, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted)" }}>{i + 1}</span>
                          <Avatar name={x.emp.name} size={28} />
                          <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{x.emp.name}</span>
                          <Badge tone={x.lateDays === 0 ? "ok" : "warn"}>
                            {x.lateDays === 0 ? "never late" : `${x.lateDays} late`}
                          </Badge>
                          <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{x.daysPresent}d</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="cp-slip-head">{isHR ? "By branch" : "Team"}</div>
                  {isHR && branches.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {branches.map((b) => (
                        <div key={b.id}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                            <span style={{ fontWeight: 600 }}>{b.name} <span style={{ color: "var(--muted)", fontWeight: 400 }}>· {b.staff}</span></span>
                            <span style={{ fontFamily: "var(--font-mono)" }}>{b.pct != null ? b.pct + "%" : "—"}</span>
                          </div>
                          <div style={{ height: 6, borderRadius: 6, background: "var(--line)", overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${Math.min(100, b.pct || 0)}%`, background: (b.pct || 0) >= 90 ? "var(--brand)" : (b.pct || 0) >= 75 ? "var(--accent)" : "var(--danger)", borderRadius: 6 }} />
                          </div>
                          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                            {b.late} late · {naira(b.absenceCost)} lost
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <Empty text={isHR ? "Add branches in Settings to compare sites." : `${myTeam.length} people report to you.`} />}
                </div>
              </div>
            </Section>
          </Card>
        );
      })()}

      <div className="cp-two-col" style={{ marginTop: 18 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {isHR && (
            <Card>
              <Section title="Headcount by department">
                {deptData.length === 0 ? <Empty text="Add employees to see this chart." /> : (
                  <div style={{ height: 220, marginTop: 4 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={deptData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                        <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme["--muted"] }} axisLine={false} tickLine={false} interval={0} />
                        <YAxis tick={{ fontSize: 11, fill: theme["--muted"] }} axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip cursor={{ fill: theme["--brand-soft"] }} contentStyle={{ background: theme["--card"], border: `1px solid ${theme["--line"]}`, borderRadius: 10, fontSize: 12, color: theme["--ink"] }} />
                        <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={38}>
                          {deptData.map((_, i) => <Cell key={i} fill={DEPT_COLORS[i % DEPT_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </Section>
            </Card>
          )}

          {(isHR || isManager) && (
            <Card>
              <Section title={isHR ? "Leave awaiting your sign-off" : "Your team's requests"} action={<button className="cp-link" onClick={() => go("leave")}>Open leave <ChevronRight size={13} /></button>}>
                {pendingForMe.length === 0 ? <Empty text="Nothing waiting — you're all caught up." /> :
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {pendingForMe.map((l) => <LeaveDecideRow key={l.id} l={l} emp={empById(l.empId)} onDecide={decideLeave} />)}
                  </div>}
              </Section>
            </Card>
          )}

          <Card>
            <Section title="Latest company news" action={<button className="cp-link" onClick={() => go("news")}>All news <ChevronRight size={13} /></button>}>
              {db.news.length === 0 ? <Empty text="No updates posted yet." /> :
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {db.news.slice(0, 2).map((p) => (
                    <div key={p.id} style={{ display: "flex", gap: 12 }}>
                      <Avatar name={p.author} size={34} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span style={{ fontWeight: 600, fontSize: 13.5 }}>{p.title}</span>
                          {p.pinned && <Badge tone="accent"><Pin size={10} /> Pinned</Badge>}
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 2, lineHeight: 1.45, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.body}</div>
                      </div>
                    </div>
                  ))}
                </div>}
            </Section>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {isHR && total > 0 && (
            <Card>
              <Section title="Today at a glance">
                <div style={{ height: 140, marginTop: -4 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={[{ name: "Present", value: presentNow }, { name: "On leave", value: onLeaveNow.length }]} dataKey="value" innerRadius={38} outerRadius={58} paddingAngle={2} startAngle={90} endAngle={-270}>
                        <Cell fill={theme["--brand"]} /><Cell fill={theme["--accent"]} />
                      </Pie>
                      <Tooltip contentStyle={{ background: theme["--card"], border: `1px solid ${theme["--line"]}`, borderRadius: 10, fontSize: 12, color: theme["--ink"] }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 18, fontSize: 12.5, marginTop: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Dot c="var(--brand)" /> Present {presentNow}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><Dot c="var(--accent)" /> On leave {onLeaveNow.length}</span>
                </div>
              </Section>
            </Card>
          )}
          {isHR && (() => {
            const today = startOfToday();
            const newStarters = db.employees.filter((e) => e.joined && (today - parseD(e.joined)) / 86400000 <= 30 && parseD(e.joined) <= today);
            const expiring = db.employees.filter((e) => e.contractEnd && (parseD(e.contractEnd) - today) / 86400000 <= 60 && parseD(e.contractEnd) >= today);
            const missing = db.employees.filter((e) => !e.nin || !e.pension || !e.acct);
            if (!newStarters.length && !expiring.length && !missing.length) return null;
            return (
              <Card>
                <Section title="Needs your attention">
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {newStarters.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 5 }}><UserPlus size={13} style={{ verticalAlign: "-2px" }} /> {newStarters.length} new {newStarters.length === 1 ? "starter" : "starters"} (last 30 days)</div>
                        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{newStarters.map((e) => e.name).join(", ")}</div>
                      </div>
                    )}
                    {expiring.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: "var(--warn)" }}><AlertTriangle size={13} style={{ verticalAlign: "-2px" }} /> {expiring.length} {expiring.length === 1 ? "contract ends" : "contracts end"} within 60 days</div>
                        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{expiring.map((e) => `${e.name} (${fmtShort(e.contractEnd)})`).join(", ")}</div>
                      </div>
                    )}
                    {missing.length > 0 && (
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 5, color: "var(--danger)" }}><ShieldAlert size={13} style={{ verticalAlign: "-2px" }} /> {missing.length} {missing.length === 1 ? "record is" : "records are"} missing statutory details</div>
                        <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Missing NIN, pension PIN or bank account — needed before payroll.</div>
                      </div>
                    )}
                  </div>
                </Section>
              </Card>
            );
          })()}

          <Card>
            <Section title="Upcoming birthdays">
              {upcomingBdays.length === 0 ? <Empty text="None in the next 30 days." /> :
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {upcomingBdays.slice(0, 4).map(({ e, diff, label }) => (
                    <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <Avatar name={e.name} size={34} tone="accent" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{e.name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{e.title || "—"}</div>
                      </div>
                      <Badge tone={diff <= 2 ? "accent" : "muted"}>{diff === 0 ? "Today 🎉" : diff === 1 ? "Tomorrow" : label}</Badge>
                    </div>
                  ))}
                </div>}
            </Section>
          </Card>
          <Card>
            <Section title="Public holidays">
              {upcomingHols.length === 0 ? <Empty text="None added yet. Add them in Settings." /> :
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {upcomingHols.slice(0, 4).map((h) => (
                    <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 11 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 9, background: "var(--brand-soft)", color: "var(--brand)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: "0 0 auto" }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, lineHeight: 1 }}>{parseD(h.date).getDate()}</span>
                        <span style={{ fontSize: 8, textTransform: "uppercase" }}>{MONTHS[parseD(h.date).getMonth()]}</span>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{h.name}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{h.diff === 0 ? "Today" : `in ${h.diff} days`}</div>
                      </div>
                    </div>
                  ))}
                </div>}
            </Section>
          </Card>
        </div>
      </div>
    </div>
  );
}


export { DashboardPage };
