import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import MapSurface from "@/app/components/maps/map-surface";
import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

afterEach(cleanup);

type StandOptions = {
  groupId?: number | null;
  left?: number;
  top?: number;
  users?: number[];
};

function stand(
  id: number,
  label: string,
  { groupId = null, left = 0, top = 0, users = [] }: StandOptions = {},
): StandWithReservationsWithParticipants {
  return {
    id,
    label,
    standNumber: id,
    status: users.length > 0 ? "confirmed" : "available",
    standGroupId: groupId,
    positionLeft: left,
    positionTop: top,
    reservations:
      users.length > 0
        ? [
            {
              status: "accepted",
              participants: users.map((userId) => ({ user: { id: userId } })),
              externalParticipants: [],
            },
          ]
        : [],
  } as unknown as StandWithReservationsWithParticipants;
}

/** A7 and A8 side by side, both held by user 7, declared as group 10 */
function jointPair() {
  return [
    stand(7, "A", { groupId: 10, left: 69.8, top: 84.5, users: [7] }),
    stand(8, "A", { groupId: 10, left: 78.5, top: 84.5, users: [7] }),
  ];
}

function standNodes(container: HTMLElement) {
  return Array.from(container.querySelectorAll("g[aria-label^='Espacio ']"));
}

function groupNodes(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll("g[aria-label^='Espacios unidos']"),
  );
}

describe("MapSurface joint groups", () => {
  it("draws a declared pair as one outline instead of two stands", () => {
    const { container } = render(<MapSurface stands={jointPair()} />);

    expect(groupNodes(container)).toHaveLength(1);
    expect(standNodes(container)).toHaveLength(0);
    expect(groupNodes(container)[0].getAttribute("aria-label")).toContain(
      "A7 - A8",
    );
    // Both member labels stay legible inside the joined shape
    expect(container.textContent).toContain("A7");
    expect(container.textContent).toContain("A8");
  });

  it("keeps ungrouped stands rendering individually", () => {
    const { container } = render(
      <MapSurface
        stands={[
          ...jointPair(),
          stand(9, "A", { left: 86.35, top: 60.2, users: [8] }),
        ]}
      />,
    );

    expect(groupNodes(container)).toHaveLength(1);
    expect(standNodes(container)).toHaveLength(1);
  });

  it("splits a group back apart when the members stop sharing a participant", () => {
    const [a] = jointPair();
    const b = stand(8, "A", { groupId: 10, left: 78.5, top: 84.5, users: [9] });
    const { container } = render(<MapSurface stands={[a, b]} />);

    expect(groupNodes(container)).toHaveLength(0);
    expect(standNodes(container)).toHaveLength(2);
  });

  it("selects the whole group when any single member is selected", () => {
    const { container } = render(
      <MapSurface stands={jointPair()} selectedStandId={8} />,
    );

    // The selection ring is a second copy of the joined outline
    expect(groupNodes(container)[0].querySelectorAll("path")).toHaveLength(2);
  });

  it("draws no selection ring when the selected stand is elsewhere", () => {
    const { container } = render(
      <MapSurface stands={jointPair()} selectedStandId={99} />,
    );

    expect(groupNodes(container)[0].querySelectorAll("path")).toHaveLength(1);
  });

  it("reports the first member when either half is clicked", () => {
    const onStandClick = vi.fn();
    const { container } = render(
      <MapSurface stands={jointPair()} onStandClick={onStandClick} />,
    );

    const pointerUp = new MouseEvent("pointerup", { bubbles: true });
    Object.defineProperty(pointerUp, "pointerType", { value: "mouse" });
    groupNodes(container)[0].dispatchEvent(pointerUp);

    expect(onStandClick).toHaveBeenCalledTimes(1);
    expect(onStandClick.mock.calls[0][0]).toMatchObject({ id: 7 });
  });

  it("colors the group from its representative stand", () => {
    const getColors = vi.fn(() => ({
      fill: "rgb(1, 2, 3)",
      hoverFill: "rgb(4, 5, 6)",
      stroke: "rgb(7, 8, 9)",
      text: "#fff",
    }));
    const { container } = render(
      <MapSurface stands={jointPair()} getColors={getColors} />,
    );

    expect(getColors).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    const outline = groupNodes(container)[0].querySelector("path");
    expect(outline?.getAttribute("fill")).toBe("rgb(1, 2, 3)");
    expect(outline?.getAttribute("stroke")).toBe("rgb(7, 8, 9)");
  });
});
