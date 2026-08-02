import { describe, expect, it } from "vitest";

import {
  buildJointGroupPath,
  findJointGroup,
  formatStandsLabel,
  getJointGroupBounds,
  getStandOccupantKey,
  getStandsProducts,
  indexJointGroupsByStandId,
  resolveJointGroups,
} from "@/app/lib/stands/groups";
import type { StandWithReservationsWithParticipants } from "@/app/api/stands/definitions";

type StandOptions = {
  groupId?: number | null;
  left?: number;
  top?: number;
  users?: number[];
  externals?: number[];
  rejectedUsers?: number[];
  label?: string;
  standNumber?: number;
  products?: string[];
};

function stand(
  id: number,
  {
    groupId = null,
    left = 0,
    top = 0,
    users = [],
    externals = [],
    rejectedUsers = [],
    label = "A",
    standNumber = id,
    products = [],
  }: StandOptions = {},
): StandWithReservationsWithParticipants {
  const reservations = [];
  if (users.length > 0 || externals.length > 0) {
    reservations.push({
      status: "accepted",
      participants: users.map((userId) => ({ user: { id: userId } })),
      externalParticipants: externals.map((externalId) => ({
        externalParticipant: { id: externalId },
      })),
    });
  }
  if (rejectedUsers.length > 0) {
    reservations.push({
      status: "rejected",
      participants: rejectedUsers.map((userId) => ({ user: { id: userId } })),
      externalParticipants: [],
    });
  }

  return {
    id,
    label,
    standNumber,
    standGroupId: groupId,
    positionLeft: left,
    positionTop: top,
    reservations,
    standSubcategories: products.map((productLabel, index) => ({
      subcategoryId: index,
      subcategory: { label: productLabel },
    })),
  } as unknown as StandWithReservationsWithParticipants;
}

describe("getStandOccupantKey", () => {
  it("returns null for an empty stand", () => {
    expect(getStandOccupantKey(stand(1))).toBeNull();
  });

  it("returns null when the only reservation was rejected", () => {
    expect(getStandOccupantKey(stand(1, { rejectedUsers: [7] }))).toBeNull();
  });

  it("does not distinguish participant ordering", () => {
    expect(getStandOccupantKey(stand(1, { users: [7, 8] }))).toBe(
      getStandOccupantKey(stand(2, { users: [8, 7] })),
    );
  });

  it("tells users and external participants apart", () => {
    expect(getStandOccupantKey(stand(1, { users: [7] }))).not.toBe(
      getStandOccupantKey(stand(2, { externals: [7] })),
    );
  });
});

describe("resolveJointGroups", () => {
  const pair = (options: StandOptions = {}) => [
    stand(1, { groupId: 10, left: 69.8, top: 84.5, users: [7], ...options }),
    stand(2, { groupId: 10, left: 78.5, top: 84.5, users: [7], ...options }),
  ];

  it("joins a declared pair held by the same participant", () => {
    const groups = resolveJointGroups(pair());
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe(10);
    expect(groups[0].axis).toBe("row");
    expect(groups[0].stands.map((s) => s.id)).toEqual([1, 2]);
  });

  it("orders members along their axis regardless of input order", () => {
    const [a, b] = pair();
    expect(resolveJointGroups([b, a])[0].stands.map((s) => s.id)).toEqual([
      1, 2,
    ]);
  });

  it("detects a vertical pair as a column", () => {
    const groups = resolveJointGroups([
      stand(1, { groupId: 10, left: 86.35, top: 49.7, users: [7] }),
      stand(2, { groupId: 10, left: 86.35, top: 60.2, users: [7] }),
    ]);
    expect(groups[0].axis).toBe("column");
  });

  it("leaves ungrouped stands alone", () => {
    expect(
      resolveJointGroups([
        stand(1, { left: 0, top: 0, users: [7] }),
        stand(2, { left: 8.7, top: 0, users: [7] }),
      ]),
    ).toEqual([]);
  });

  it("ignores a group whose members are held by different participants", () => {
    const [a] = pair();
    const b = stand(2, { groupId: 10, left: 78.5, top: 84.5, users: [8] });
    expect(resolveJointGroups([a, b])).toEqual([]);
  });

  it("ignores a group where only one member is occupied", () => {
    const [a] = pair();
    const b = stand(2, { groupId: 10, left: 78.5, top: 84.5 });
    expect(resolveJointGroups([a, b])).toEqual([]);
  });

  it("ignores a declared group that nobody occupies", () => {
    expect(resolveJointGroups(pair({ users: [] }))).toEqual([]);
  });

  it("ignores a lone stand left in a group", () => {
    expect(resolveJointGroups([pair()[0]])).toEqual([]);
  });

  it("ignores members that line up on neither axis", () => {
    const [a] = pair();
    const b = stand(2, { groupId: 10, left: 78.5, top: 95, users: [7] });
    expect(resolveJointGroups([a, b])).toEqual([]);
  });

  it("tolerates the drift left by freehand placement", () => {
    const a = stand(1, { groupId: 10, left: 69.8, top: 84.5, users: [7] });
    const b = stand(2, { groupId: 10, left: 78.5, top: 84.8, users: [7] });
    expect(resolveJointGroups([a, b])[0].axis).toBe("row");
  });

  it("indexes every member back to its group", () => {
    const index = indexJointGroupsByStandId(resolveJointGroups(pair()));
    expect(index.get(1)).toBe(index.get(2));
    expect(index.get(99)).toBeUndefined();
  });
});

describe("findJointGroup", () => {
  const pair = () => [
    stand(7, { groupId: 10, left: 69.8, top: 84.5, users: [7] }),
    stand(8, { groupId: 10, left: 78.5, top: 84.5, users: [7] }),
  ];

  it("finds the group from either member", () => {
    const stands = pair();
    expect(findJointGroup(stands, 7)?.stands.map((s) => s.id)).toEqual([7, 8]);
    expect(findJointGroup(stands, 8)?.stands.map((s) => s.id)).toEqual([7, 8]);
  });

  it("returns null for a stand that stands alone", () => {
    expect(findJointGroup([...pair(), stand(9, { users: [8] })], 9)).toBeNull();
  });

  it("returns null without a selection", () => {
    expect(findJointGroup(pair(), null)).toBeNull();
    expect(findJointGroup(pair(), undefined)).toBeNull();
  });
});

describe("formatStandsLabel", () => {
  it("names a lone stand plainly", () => {
    expect(formatStandsLabel([stand(7)])).toBe("A7");
  });

  it("joins every member of a group in order", () => {
    expect(formatStandsLabel([stand(7), stand(8)])).toBe("A7 - A8");
  });

  it("orders numerically, not as text", () => {
    // Members arrive in map order, which can put A10 to the left of A9
    expect(formatStandsLabel([stand(10), stand(9)])).toBe("A9 - A10");
  });

  it("orders by label before number", () => {
    expect(
      formatStandsLabel([
        stand(2, { label: "B", standNumber: 2 }),
        stand(1, { label: "A", standNumber: 10 }),
      ]),
    ).toBe("A10 - B2");
  });

  it("leaves the caller's array untouched", () => {
    const stands = [stand(10), stand(9)];
    formatStandsLabel(stands);
    expect(stands.map((s) => s.standNumber)).toEqual([10, 9]);
  });
});

describe("getStandsProducts", () => {
  it("lists a lone stand's products", () => {
    expect(getStandsProducts([stand(7, { products: ["Stickers"] })])).toEqual([
      "Stickers",
    ]);
  });

  it("unions products across members without repeating", () => {
    expect(
      getStandsProducts([
        stand(7, { products: ["Stickers", "Prints"] }),
        stand(8, { products: ["Prints", "Pins"] }),
      ]),
    ).toEqual(["Stickers", "Prints", "Pins"]);
  });

  it("copes with a stand carrying no products", () => {
    expect(getStandsProducts([stand(7), stand(8)])).toEqual([]);
  });
});

describe("getJointGroupBounds", () => {
  it("spans both members and seams halfway across the gap", () => {
    const [group] = resolveJointGroups([
      stand(1, { groupId: 10, left: 69.8, top: 84.5, users: [7] }),
      stand(2, { groupId: 10, left: 78.5, top: 84.5, users: [7] }),
    ]);
    const bounds = getJointGroupBounds(group);
    expect(bounds.x).toBe(69.8);
    expect(bounds.y).toBe(84.5);
    expect(bounds.width).toBeCloseTo(14.7, 5);
    expect(bounds.height).toBe(6);
    // 69.8 + 6 = 75.8 and 78.5 → midpoint 77.15
    expect(bounds.seams[0]).toBeCloseTo(77.15, 5);
  });

  it("spans vertically for a column", () => {
    const [group] = resolveJointGroups([
      stand(1, { groupId: 10, left: 86.35, top: 49.7, users: [7] }),
      stand(2, { groupId: 10, left: 86.35, top: 60.2, users: [7] }),
    ]);
    const bounds = getJointGroupBounds(group);
    expect(bounds.width).toBe(6);
    expect(bounds.height).toBeCloseTo(16.5, 5);
    // 49.7 + 6 = 55.7 and 60.2 → midpoint 57.95
    expect(bounds.seams[0]).toBeCloseTo(57.95, 5);
  });
});

describe("buildJointGroupPath", () => {
  const bounds = { x: 0, y: 0, width: 6, height: 14.7, seams: [7.35] };

  it("pinches both long edges of a column at the seam", () => {
    const path = buildJointGroupPath(bounds, "column");
    // One notch arc per long edge, plus the four corners
    expect(path.match(/A 0.9 0.9 0 0 0/g)).toHaveLength(2);
    expect(path.match(/A 0.8 0.8 0 0 1/g)).toHaveLength(4);
    expect(path.endsWith("Z")).toBe(true);
  });

  it("pinches the top and bottom edges of a row", () => {
    const path = buildJointGroupPath(
      { x: 0, y: 0, width: 14.7, height: 6, seams: [7.35] },
      "row",
    );
    expect(path.match(/A 0.9 0.9 0 0 0/g)).toHaveLength(2);
    expect(path).toContain("L 6.45 0");
    expect(path).toContain("A 0.9 0.9 0 0 0 8.25 0");
  });

  it("adds a notch per seam for longer groups", () => {
    const path = buildJointGroupPath(
      { x: 0, y: 0, width: 6, height: 23.4, seams: [7.35, 16.05] },
      "column",
    );
    expect(path.match(/A 0.9 0.9 0 0 0/g)).toHaveLength(4);
  });

  it("never rounds corners past half the shorter side", () => {
    const path = buildJointGroupPath(
      { x: 0, y: 0, width: 1, height: 14.7, seams: [7.35] },
      "column",
    );
    expect(path).toContain("A 0.5 0.5 0 0 1");
  });
});
