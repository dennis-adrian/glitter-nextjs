import { describe, expect, it } from "vitest";

import { formatStandLabel } from "./helpers";

describe("formatStandLabel", () => {
  it("concatenates label and stand number", () => {
    expect(formatStandLabel({ label: "A", standNumber: 12 })).toBe("A12");
  });

  it("uses an empty string when label is null", () => {
    expect(formatStandLabel({ label: null, standNumber: 12 })).toBe("12");
  });
});
