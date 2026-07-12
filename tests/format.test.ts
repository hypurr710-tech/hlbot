import { describe, it, expect } from "vitest";
import { formatUsd } from "@/lib/format";

describe("format.formatUsd", () => {
  it("keeps cents for small funding amounts (does not round away)", () => {
    expect(formatUsd(2.47)).toBe("$2.47");
    expect(formatUsd(0.09)).toBe("$0.09");
    expect(formatUsd(127.4)).toBe("$127.40");
  });
  it("shows whole dollars with grouping for capital-scale amounts", () => {
    expect(formatUsd(2170)).toBe("$2,170");
    expect(formatUsd(2927.33)).toBe("$2,927");
  });
  it("abbreviates millions", () => {
    expect(formatUsd(2_500_000)).toBe("$2.50M");
  });
  it("preserves sign", () => {
    expect(formatUsd(-2.47)).toBe("-$2.47");
    expect(formatUsd(-2170)).toBe("-$2,170");
  });
});
