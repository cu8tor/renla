import { DAYS } from "../features/attendance/attendanceLogic.js";

/* A Mon–Sun row editor for a { Mon: {start,end}|{off:true}, ... } schedule.
   Shared by the company's working-hours settings, a branch's hours, and an
   individual employee's custom hours — so all three look and behave the
   same way instead of three slightly different hand-rolled versions. */
function WeekScheduleEditor({ schedule, onChangeDay, note }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {DAYS.map((day) => {
        const d = (schedule && schedule[day]) || {};
        const off = Boolean(d.off);
        return (
          <div key={day} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "var(--card2)", border: "1px solid var(--line)", borderRadius: 9 }}>
            <div style={{ width: 40, fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>{day}</div>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--muted)", cursor: "pointer" }}>
              <input type="checkbox" checked={off} onChange={(e) => onChangeDay(day, { off: e.target.checked })} />
              Day off
            </label>
            {!off && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
                <input type="time" className="cp-input" style={{ width: 120 }}
                  value={d.start || ""} onChange={(e) => onChangeDay(day, { start: e.target.value })} />
                <span style={{ color: "var(--muted)", fontSize: 12.5 }}>to</span>
                <input type="time" className="cp-input" style={{ width: 120 }}
                  value={d.end || ""} onChange={(e) => onChangeDay(day, { end: e.target.value })} />
              </div>
            )}
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.5, marginTop: 2 }}>
        {note || "Leave a day's times blank to fall back to the next thing in the chain for that day only."}
      </div>
    </div>
  );
}

export { WeekScheduleEditor };
