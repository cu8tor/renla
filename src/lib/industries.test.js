import { describe, it, expect } from "vitest";
import { INDUSTRIES, industryLabel, isIndustry } from "./industries.js";

describe("industries", () => {
  it("has no duplicate keys, so counts stay comparable", () => {
    const keys = INDUSTRIES.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("uses keys safe to store and compare", () => {
    for (const i of INDUSTRIES) expect(i.key).toMatch(/^[a-z]+$/);
  });

  it("gives every key a label", () => {
    for (const i of INDUSTRIES) expect(i.label.trim().length).toBeGreaterThan(0);
  });

  it("offers an escape hatch, so nobody is forced into a wrong answer", () => {
    expect(isIndustry("other")).toBe(true);
  });

  it("resolves a known key to its label", () => {
    expect(industryLabel("security")).toBe("Security services");
  });

  /* A company set by hand, or one whose category was renamed, should
     still read as something rather than vanish from the list. */
  it("shows an unknown key as itself rather than blank", () => {
    expect(industryLabel("mining")).toBe("mining");
  });

  it("treats nothing as nothing", () => {
    expect(industryLabel("")).toBe("");
    expect(industryLabel(null)).toBe("");
    expect(industryLabel(undefined)).toBe("");
    expect(isIndustry("")).toBe(false);
    expect(isIndustry(null)).toBe(false);
  });

  it("ignores stray whitespace around a key", () => {
    expect(industryLabel("  retail  ")).toBe("Retail & shops");
    expect(isIndustry(" food ")).toBe(true);
  });
});
