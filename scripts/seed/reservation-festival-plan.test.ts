import { describe, expect, it } from "vitest";

import {
  DEMO_FESTIVAL_NAME,
  DEMO_SECTORS,
  ENROLLED_DEMO_USER_KEYS,
  LOCAL_SEED_USERS,
  STANDS_PER_SECTOR,
  seedStandPosition,
  seedStandRole,
  seedStandStoredStatus,
  sectorMapBounds,
} from "./reservation-festival-plan";

describe("reservation festival seed plan", () => {
  it("uses a stable festival name and one sector per participant category", () => {
    expect(DEMO_FESTIVAL_NAME).toBe("Glitter Demo");
    expect(DEMO_SECTORS.map((sector) => sector.category)).toEqual([
      "illustration",
      "gastronomy",
      "entrepreneurship",
    ]);
  });

  it("places stands on a grid so joint illustration stands share a row", () => {
    const fifth = seedStandPosition(5);
    const sixth = seedStandPosition(6);
    expect(fifth.positionTop).toBe(sixth.positionTop);
    expect(sixth.positionLeft).toBeGreaterThan(fifth.positionLeft);
    expect(sectorMapBounds().mapWidth).toBeGreaterThan(sixth.positionLeft);
  });

  it("covers map privacy, occupancy, disabled, stale-hold, and joint-group cases", () => {
    expect(seedStandRole("illustration", 1)).toBe("reserved_visible");
    expect(seedStandRole("illustration", 2)).toBe("reserved_hidden");
    expect(seedStandRole("illustration", 3)).toBe("disabled");
    expect(seedStandRole("illustration", 4)).toBe("stale_held");
    expect(seedStandRole("illustration", 5)).toBe("joint");
    expect(seedStandRole("illustration", 6)).toBe("joint");
    expect(seedStandRole("illustration", 7)).toBe("available");
    expect(seedStandRole("gastronomy", 2)).toBe("available");
    expect(seedStandStoredStatus("reserved_hidden")).toBe("reserved");
    expect(seedStandStoredStatus("stale_held")).toBe("held");
    expect(STANDS_PER_SECTOR).toBe(12);
  });

  it("keeps local occupants off Clerk test emails and includes PII fields", () => {
    expect(ENROLLED_DEMO_USER_KEYS).toContain("illustration_partner");
    for (const user of LOCAL_SEED_USERS) {
      expect(user.email).not.toContain("+clerk_test@");
      expect(user.phoneNumber.startsWith("+591")).toBe(true);
      expect(user.clerkId.startsWith("seed:")).toBe(true);
    }
  });
});
