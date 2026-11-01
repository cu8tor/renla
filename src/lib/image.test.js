import { describe, it, expect } from "vitest";
import { prettySize, shrinkImageFile } from "./image.js";

/* The canvas paths in this module need a real DOM and can't run under the
   node test environment, so what's covered here is the decision-making
   that happens before any drawing: what counts as an image, and how a
   size is worded in the message someone actually reads. */

describe("prettySize", () => {
  it("uses MB above a megabyte, to one decimal", () => {
    expect(prettySize(10 * 1024 * 1024)).toBe("10.0 MB");
    expect(prettySize(12_400_000)).toBe("11.8 MB");
  });

  it("uses whole KB below that", () => {
    expect(prettySize(12_870)).toBe("13 KB");
    expect(prettySize(500 * 1024)).toBe("500 KB");
  });

  it("never reports 0 KB for a file that exists", () => {
    expect(prettySize(1)).toBe("1 KB");
    expect(prettySize(400)).toBe("1 KB");
  });
});

describe("shrinkImageFile", () => {
  it("passes a PDF through untouched", async () => {
    const pdf = { name: "contract.pdf", type: "application/pdf", size: 2_000_000 };
    expect(await shrinkImageFile(pdf)).toBe(pdf);
  });

  it("passes a file with no type through untouched", async () => {
    const odd = { name: "scan", type: "", size: 900 };
    expect(await shrinkImageFile(odd)).toBe(odd);
  });

  it("doesn't throw on a missing file", async () => {
    await expect(shrinkImageFile(null)).resolves.toBe(null);
    await expect(shrinkImageFile(undefined)).resolves.toBe(undefined);
  });
});
