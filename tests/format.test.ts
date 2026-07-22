import { describe, it, expect } from "vitest";
import { formatUsd, formatKrwCompact } from "@/lib/format";

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

describe("format.formatKrwCompact", () => {
  it("formats 억 scale", () => {
    expect(formatKrwCompact(250_000_000)).toBe("₩2.5억");
    expect(formatKrwCompact(1_000_000_000)).toBe("₩10억");
  });
  it("formats 만원 scale", () => {
    expect(formatKrwCompact(35_000_000)).toBe("₩3,500만");
    expect(formatKrwCompact(10_000)).toBe("₩1만");
  });
  it("formats sub-만원 as plain won", () => {
    expect(formatKrwCompact(9_000)).toBe("₩9,000");
    expect(formatKrwCompact(0)).toBe("₩0");
  });
  it("keeps sign for negatives", () => {
    expect(formatKrwCompact(-35_000_000)).toBe("-₩3,500만");
  });
});
