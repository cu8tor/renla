import { describe, it, expect } from "vitest";
import { byTrouble } from "./AdminPage.jsx";

/* A list sorted so that somebody in arrears sits below somebody who is
   fine is a silent failure: you look at the top of the screen, see
   green, and never scroll. */
const co = (name, balance, monthly_charge) => ({ id: name, name, balance, monthly_charge });

describe("byTrouble", () => {
  it("puts companies in arrears above everybody else", () => {
    const rows = [
      co("Fine Ltd", 20000, 5000),
      co("Free Co", 0, 0),
      co("Behind Ltd", -5000, 5000),
      co("Empty Ltd", 0, 5000),
    ];
    expect([...rows].sort(byTrouble).map((r) => r.name))
      .toEqual(["Behind Ltd", "Empty Ltd", "Fine Ltd", "Free Co"]);
  });

  it("puts the deepest arrears first", () => {
    const rows = [co("A", -5000, 5000), co("B", -40000, 5000), co("C", -10000, 5000)];
    expect([...rows].sort(byTrouble).map((r) => r.name)).toEqual(["B", "C", "A"]);
  });

  it("ranks a thin wallet above a healthy one", () => {
    const rows = [co("Healthy", 50000, 5000), co("Thin", 1000, 5000)];
    expect([...rows].sort(byTrouble).map((r) => r.name)).toEqual(["Thin", "Healthy"]);
  });

  it("never sorts a free-plan company above one that owes money", () => {
    const rows = [co("Free", 0, 0), co("Owing", -1, 5000)];
    expect([...rows].sort(byTrouble)[0].name).toBe("Owing");
  });

  it("falls back to name so the order does not jump between refreshes", () => {
    const rows = [co("Zeta", 20000, 5000), co("Alpha", 20000, 5000)];
    expect([...rows].sort(byTrouble).map((r) => r.name)).toEqual(["Alpha", "Zeta"]);
  });

  it("does not crash on missing figures", () => {
    const rows = [{ id: "x", name: "No data" }, co("Behind", -5000, 5000)];
    expect(() => [...rows].sort(byTrouble)).not.toThrow();
    expect([...rows].sort(byTrouble)[0].name).toBe("Behind");
  });
});
