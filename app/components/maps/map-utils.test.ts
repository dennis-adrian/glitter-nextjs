import { describe, expect, it } from "vitest";

import {
  getStandFillColor,
  getStandHoverFillColor,
  getStandStrokeColor,
  getStandTextColor,
  SELECTED_FILL,
  SELECTED_STROKE,
  SELECTED_TEXT,
} from "@/app/components/maps/map-utils";

describe("reserved stand colours", () => {
  it("fills a reserved stand apart from selected, confirmed and available", () => {
    const reserved = getStandFillColor("reserved", false);

    expect(reserved).not.toBe(SELECTED_FILL);
    expect(reserved).not.toBe(getStandFillColor("confirmed", false));
    expect(reserved).not.toBe(getStandFillColor("available", true));
    expect(reserved).not.toBe(getStandFillColor("held", false));
    expect(reserved.startsWith("var(--map-reserved-fill,")).toBe(true);
  });

  it("lets the dark theme override every reserved colour", () => {
    expect(
      getStandHoverFillColor("reserved", false).startsWith(
        "var(--map-reserved-hover,",
      ),
    ).toBe(true);
    expect(
      getStandStrokeColor("reserved", false).startsWith(
        "var(--map-reserved-stroke,",
      ),
    ).toBe(true);
    expect(
      getStandTextColor("reserved", false).startsWith(
        "var(--map-reserved-text,",
      ),
    ).toBe(true);
  });

  it("no longer draws a reserved stand like the selected one", () => {
    expect(getStandStrokeColor("reserved", false)).not.toBe(SELECTED_STROKE);
    expect(getStandTextColor("reserved", false)).not.toBe(SELECTED_TEXT);
    expect(getStandFillColor("reserved", false)).not.toContain("91, 33, 182");
  });
});
