import { describe, it, expect } from "vitest";
import { DEFAULT_ONBOARDING, onboardingChecklist } from "./onboarding.js";

const blankEmp = { emergency: "", kin: "", referenceName: "", referencePhone: "", bank: "", acct: "", nin: "", bvn: "", avatarPath: "" };

describe("onboardingChecklist", () => {
  it("nothing required by default — always complete, zero required total", () => {
    const c = onboardingChecklist(blankEmp, {}, []);
    expect(c.requiredTotal).toBe(0);
    expect(c.requiredDone).toBe(0);
    expect(c.complete).toBe(true);
    // still reports every item so the profile page can show optional ones
    expect(c.items.length).toBe(8);
    expect(c.items.every((i) => !i.required)).toBe(true);
  });

  it("flags missing required fields as not done", () => {
    const cfg = { ...DEFAULT_ONBOARDING, requireEmergency: true, requireBank: true };
    const c = onboardingChecklist(blankEmp, cfg, []);
    expect(c.requiredTotal).toBe(2);
    expect(c.requiredDone).toBe(0);
    expect(c.complete).toBe(false);
  });

  it("a filled-in field counts as done", () => {
    const cfg = { requireEmergency: true };
    const emp = { ...blankEmp, emergency: "Bola Ade — 08012345678" };
    const c = onboardingChecklist(emp, cfg, []);
    expect(c.requiredDone).toBe(1);
    expect(c.complete).toBe(true);
  });

  it("reference requires both a name and a phone, not just one", () => {
    const cfg = { requireReference: true };
    const half = onboardingChecklist({ ...blankEmp, referenceName: "Chidi" }, cfg, []);
    expect(half.complete).toBe(false);
    const full = onboardingChecklist({ ...blankEmp, referenceName: "Chidi", referencePhone: "0801" }, cfg, []);
    expect(full.complete).toBe(true);
  });

  it("bank requires both bank name and account number", () => {
    const cfg = { requireBank: true };
    const half = onboardingChecklist({ ...blankEmp, bank: "GTBank" }, cfg, []);
    expect(half.complete).toBe(false);
    const full = onboardingChecklist({ ...blankEmp, bank: "GTBank", acct: "0123456789" }, cfg, []);
    expect(full.complete).toBe(true);
  });

  it("ID document requirement is satisfied by any uploaded doc row", () => {
    const cfg = { requireIdDocument: true };
    const none = onboardingChecklist(blankEmp, cfg, []);
    expect(none.complete).toBe(false);
    const withDoc = onboardingChecklist(blankEmp, cfg, [{ id: "d1", kind: "id" }]);
    expect(withDoc.complete).toBe(true);
  });

  it("missing db.onboarding config (undefined) behaves like all-off defaults", () => {
    const c = onboardingChecklist(blankEmp, undefined, undefined);
    expect(c.requiredTotal).toBe(0);
    expect(c.complete).toBe(true);
  });

  it("missing employee (undefined) does not throw and required items count as not done", () => {
    const c = onboardingChecklist(undefined, { requireEmergency: true }, []);
    expect(c.requiredTotal).toBe(1);
    expect(c.requiredDone).toBe(0);
    expect(c.complete).toBe(false);
  });
});
