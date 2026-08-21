import { describe, expect, it } from "vitest";

import { sanitizeCsvCell, serializeCsvRows } from "@/app/lib/orders/csv";

describe("sanitizeCsvCell", () => {
  it("prefixes formula-like values even when they have leading whitespace", () => {
    expect(sanitizeCsvCell("=SUM(A1:A2)")).toBe("'=SUM(A1:A2)");
    expect(sanitizeCsvCell("  =CMD")).toBe("'  =CMD");
    expect(sanitizeCsvCell("\t+1+1")).toBe("'\t+1+1");
    expect(sanitizeCsvCell(" -1")).toBe("' -1");
    expect(sanitizeCsvCell(" @import")).toBe("' @import");
  });

  it("returns the original untrimmed string for non-formula cells", () => {
    expect(sanitizeCsvCell("  Product Blue  ")).toBe("  Product Blue  ");
    expect(sanitizeCsvCell("")).toBe("");
    expect(sanitizeCsvCell("   ")).toBe("   ");
  });
});

describe("serializeCsvRows", () => {
  it("neutralizes spreadsheet formulas and keeps CSV escaping", () => {
    expect(serializeCsvRows([["=SUM(A1:A2)", 'Product "Blue", XL']])).toBe(
      '"\'=SUM(A1:A2)","Product ""Blue"", XL"',
    );
  });
});

