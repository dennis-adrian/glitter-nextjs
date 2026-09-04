// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FullTableGraphic from "@/app/components/festivals/reservations/full-table-graphic";

/**
 * Legs are the one part of the drawing that has to be structurally right: a
 * table stands on its corners. They used to be drawn per half, at each half's
 * right-hand edge, which put two at the far end and two at the seam and left
 * the near end looking like an unsupported board resting against a table.
 */
function legFeet(container: HTMLElement) {
  return Array.from(container.querySelectorAll("line"))
    .filter((line) => line.getAttribute("stroke-linecap") === "round")
    .map((line) => ({
      x: Number(line.getAttribute("x1")),
      y: Number(line.getAttribute("y1")),
    }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
}

describe("FullTableGraphic", () => {
  afterEach(cleanup);

  it("stands a full table on four legs, two at each end", () => {
    const { container } = render(<FullTableGraphic variant="full" />);
    const feet = legFeet(container);

    expect(feet).toHaveLength(4);

    // Two clustered at the near end, two at the far end, and nothing in the
    // middle where the halves meet.
    const xs = feet.map((foot) => foot.x);
    const span = Math.max(...xs) - Math.min(...xs);
    const nearEnd = xs.filter((x) => x < Math.min(...xs) + span / 3);
    const farEnd = xs.filter((x) => x > Math.max(...xs) - span / 3);
    expect(nearEnd).toHaveLength(2);
    expect(farEnd).toHaveLength(2);
  });

  it("stands a single half on four legs too", () => {
    const { container } = render(<FullTableGraphic variant="half" />);

    expect(legFeet(container)).toHaveLength(4);
  });

  it("puts a full table's legs further apart than a half's", () => {
    const half = render(<FullTableGraphic variant="half" />);
    const halfSpan = (() => {
      const xs = legFeet(half.container).map((foot) => foot.x);
      return Math.max(...xs) - Math.min(...xs);
    })();
    cleanup();

    const full = render(<FullTableGraphic variant="full" />);
    const fullSpan = (() => {
      const xs = legFeet(full.container).map((foot) => foot.x);
      return Math.max(...xs) - Math.min(...xs);
    })();

    expect(fullSpan).toBeGreaterThan(halfSpan);
  });
});
