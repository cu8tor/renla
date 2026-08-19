import { describe, it, expect, beforeEach } from "vitest";
import { savePendingAttendance, loadPendingAttendance, mergePendingAttendance } from "./offlineQueue.js";

// Tests run under plain Node (no jsdom), so stub just enough of `window` for
// the module's try/catch-guarded calls to actually exercise real storage
// instead of silently no-op'ing.
function makeFakeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

beforeEach(() => {
  globalThis.window = { localStorage: makeFakeLocalStorage() };
});

describe("savePendingAttendance / loadPendingAttendance", () => {
  it("round-trips rows for a given company + employee", () => {
    const rows = [{ id: "att1", empId: "e1", date: "2026-08-19", clockIn: "09:00", clockOut: "" }];
    savePendingAttendance("c1", "e1", rows);
    expect(loadPendingAttendance("c1", "e1")).toEqual(rows);
  });

  it("keeps different employees' pending rows separate", () => {
    savePendingAttendance("c1", "e1", [{ id: "a1", empId: "e1" }]);
    savePendingAttendance("c1", "e2", [{ id: "a2", empId: "e2" }]);
    expect(loadPendingAttendance("c1", "e1")).toEqual([{ id: "a1", empId: "e1" }]);
    expect(loadPendingAttendance("c1", "e2")).toEqual([{ id: "a2", empId: "e2" }]);
  });

  it("saving an empty array clears any previously stored rows", () => {
    savePendingAttendance("c1", "e1", [{ id: "a1", empId: "e1" }]);
    savePendingAttendance("c1", "e1", []);
    expect(loadPendingAttendance("c1", "e1")).toEqual([]);
  });

  it("returns an empty array when nothing's been stored yet", () => {
    expect(loadPendingAttendance("c1", "unknown-emp")).toEqual([]);
  });

  it("returns an empty array without throwing if company/employee id is missing", () => {
    expect(loadPendingAttendance(null, null)).toEqual([]);
    expect(() => savePendingAttendance(null, null, [{ id: "a1" }])).not.toThrow();
  });

  it("doesn't throw when localStorage is unavailable (e.g. private mode)", () => {
    globalThis.window = {
      localStorage: {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
        removeItem: () => { throw new Error("blocked"); },
      },
    };
    expect(() => savePendingAttendance("c1", "e1", [{ id: "a1" }])).not.toThrow();
    expect(loadPendingAttendance("c1", "e1")).toEqual([]);
  });
});

describe("mergePendingAttendance", () => {
  const workspace = { attendance: [{ id: "att-server", empId: "e1", clockIn: "09:05" }], employees: [] };

  it("returns the workspace unchanged when there's nothing pending", () => {
    expect(mergePendingAttendance(workspace, "c1", "e1")).toBe(workspace);
  });

  it("adds a pending row the server doesn't have yet", () => {
    savePendingAttendance("c1", "e1", [{ id: "att-local", empId: "e1", clockIn: "09:00" }]);
    const merged = mergePendingAttendance(workspace, "c1", "e1");
    expect(merged.attendance.map((a) => a.id).sort()).toEqual(["att-local", "att-server"]);
  });

  it("a pending row wins over the server's version of the same id — the server hasn't seen the local edit yet", () => {
    savePendingAttendance("c1", "e1", [{ id: "att-server", empId: "e1", clockIn: "09:00", clockOut: "17:00" }]);
    const merged = mergePendingAttendance(workspace, "c1", "e1");
    expect(merged.attendance).toEqual([{ id: "att-server", empId: "e1", clockIn: "09:00", clockOut: "17:00" }]);
  });

  it("leaves other collections on the workspace untouched", () => {
    savePendingAttendance("c1", "e1", [{ id: "att-local", empId: "e1" }]);
    const merged = mergePendingAttendance({ ...workspace, employees: [{ id: "emp1" }] }, "c1", "e1");
    expect(merged.employees).toEqual([{ id: "emp1" }]);
  });
});
