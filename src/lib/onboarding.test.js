import { describe, it, expect } from "vitest";
import { DEFAULT_ONBOARDING, NEW_COMPANY_ONBOARDING, onboardingChecklist } from "./onboarding.js";

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

/* These three defaults decide what every brand-new company asks its staff
   for, so they're worth pinning down rather than leaving to a later
   accidental edit. */
describe("NEW_COMPANY_ONBOARDING", () => {
  it("requires exactly bank details, NIN and an emergency contact", () => {
    const on = Object.keys(NEW_COMPANY_ONBOARDING).filter((k) => NEW_COMPANY_ONBOARDING[k]);
    expect(on.sort()).toEqual(["requireBank", "requireEmergency", "requireNin"]);
  });

  it("leaves the sensitive and optional ones off", () => {
    expect(NEW_COMPANY_ONBOARDING.requireBvn).toBe(false);
    expect(NEW_COMPANY_ONBOARDING.requirePhoto).toBe(false);
    expect(NEW_COMPANY_ONBOARDING.requireKin).toBe(false);
    expect(NEW_COMPANY_ONBOARDING.requireReference).toBe(false);
    expect(NEW_COMPANY_ONBOARDING.requireIdDocument).toBe(false);
  });

  it("covers every key the all-off default does, so nothing is left undefined", () => {
    expect(Object.keys(NEW_COMPANY_ONBOARDING).sort()).toEqual(Object.keys(DEFAULT_ONBOARDING).sort());
  });

  it("does not change the fallback used for existing companies", () => {
    expect(Object.values(DEFAULT_ONBOARDING).every((v) => v === false)).toBe(true);
  });

  it("gives a new company three real items to ask for", () => {
    const c = onboardingChecklist(blankEmp, NEW_COMPANY_ONBOARDING, []);
    expect(c.requiredTotal).toBe(3);
    expect(c.complete).toBe(false);
  });
});
