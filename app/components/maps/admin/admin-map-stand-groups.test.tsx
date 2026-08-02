import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AdminMapStandGroups from "@/app/components/maps/admin/admin-map-stand-groups";
import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

afterEach(cleanup);

function stand(
  id: number,
  groupId: number | null,
): StandWithReservationsWithParticipants {
  // The editor reads live positions from the map, never from the stand row
  return { id, standGroupId: groupId } as StandWithReservationsWithParticipants;
}

function renderGroups(
  stands: StandWithReservationsWithParticipants[],
  positions: [number, { left: number; top: number }][],
) {
  const { container } = render(
    <svg>
      <AdminMapStandGroups stands={stands} positions={new Map(positions)} />
    </svg>,
  );
  return container;
}

describe("AdminMapStandGroups", () => {
  it("draws nothing when no stand is grouped", () => {
    const container = renderGroups(
      [stand(1, null), stand(2, null)],
      [
        [1, { left: 0, top: 0 }],
        [2, { left: 8.7, top: 0 }],
      ],
    );
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });

  it("outlines a declared group even before anyone occupies it", () => {
    const container = renderGroups(
      [stand(1, 10), stand(2, 10)],
      [
        [1, { left: 69.8, top: 84.5 }],
        [2, { left: 78.5, top: 84.5 }],
      ],
    );

    const rect = container.querySelector("rect");
    expect(rect).toBeTruthy();
    // Union of both 6x6 stands, padded by 1 on every side
    expect(Number(rect?.getAttribute("x"))).toBeCloseTo(68.8, 5);
    expect(Number(rect?.getAttribute("y"))).toBeCloseTo(83.5, 5);
    expect(Number(rect?.getAttribute("width"))).toBeCloseTo(16.7, 5);
    expect(Number(rect?.getAttribute("height"))).toBeCloseTo(8, 5);
    expect(container.textContent).toBe("");
  });

  it("flags a group whose members were dragged out of line", () => {
    const container = renderGroups(
      [stand(1, 10), stand(2, 10)],
      [
        [1, { left: 69.8, top: 84.5 }],
        [2, { left: 78.5, top: 95 }],
      ],
    );

    expect(container.textContent).toContain("sin alinear");
  });

  it("follows the live drag position rather than the stored one", () => {
    const container = renderGroups(
      [stand(1, 10), stand(2, 10)],
      [
        [1, { left: 0, top: 0 }],
        [2, { left: 8.7, top: 0 }],
      ],
    );

    expect(Number(container.querySelector("rect")?.getAttribute("x"))).toBe(-1);
  });

  it("ignores a group with only one member on the canvas", () => {
    const container = renderGroups([stand(1, 10)], [[1, { left: 0, top: 0 }]]);
    expect(container.querySelectorAll("rect")).toHaveLength(0);
  });

  it("keeps separate groups in separate outlines", () => {
    const container = renderGroups(
      [stand(1, 10), stand(2, 10), stand(3, 11), stand(4, 11)],
      [
        [1, { left: 0, top: 0 }],
        [2, { left: 8.7, top: 0 }],
        [3, { left: 0, top: 20 }],
        [4, { left: 8.7, top: 20 }],
      ],
    );
    expect(container.querySelectorAll("rect")).toHaveLength(2);
  });

  it("never intercepts pointer events meant for the stands", () => {
    const container = renderGroups(
      [stand(1, 10), stand(2, 10)],
      [
        [1, { left: 0, top: 0 }],
        [2, { left: 8.7, top: 0 }],
      ],
    );
    expect(container.querySelector("g")?.style.pointerEvents).toBe("none");
  });
});
