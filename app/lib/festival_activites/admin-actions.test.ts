// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const dbTouched = vi.hoisted(() => ({ count: 0 }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/emails/activity-proof-review", () => ({ default: vi.fn() }));
vi.mock("@/app/emails/activity-waitlist-invitation", () => ({
  default: vi.fn(),
}));
vi.mock("@/app/lib/festival_activites/waitlist-promotion", () => ({
  promoteFromWaitlist: vi.fn(),
}));
vi.mock("@/app/lib/festival_activites/queries", () => ({
  wasRemovedFromActivity: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => ({ id: 1, role: "admin" }),
}));
// The proof guard must refuse before any write: a stamp card saved without
// image proof could never put a stand on the map.
vi.mock("@/db", () => ({
  db: new Proxy(
    {},
    {
      get() {
        dbTouched.count += 1;
        throw new Error("database touched");
      },
    },
  ),
}));

import {
  createFestivalActivity,
  updateFestivalActivity,
  type FestivalActivityInput,
} from "@/app/lib/festival_activites/admin-actions";
import { REQUIRED_PROOF_TYPE_MESSAGE } from "@/app/lib/festival_activites/helpers";

function stampCard(
  overrides: Partial<FestivalActivityInput> = {},
): FestivalActivityInput {
  return {
    name: "Tarjeta de sellos",
    type: "stamp_card",
    accessLevel: "public",
    registrationStartDate: new Date("2026-01-01T00:00:00Z"),
    registrationEndDate: new Date("2026-01-10T00:00:00Z"),
    proofType: "image",
    proofUploadLimitDate: new Date("2026-01-20T00:00:00Z"),
    allowsVoting: false,
    details: [{ description: "Única" }],
    ...overrides,
  };
}

describe("stamp card proof guard", () => {
  beforeEach(() => {
    dbTouched.count = 0;
  });

  it.each([null, undefined, "text", "both"] as const)(
    "refuses to create a stamp card with proofType %s",
    async (proofType) => {
      const result = await createFestivalActivity(1, stampCard({ proofType }));
      expect(result).toEqual({
        success: false,
        message: REQUIRED_PROOF_TYPE_MESSAGE,
      });
      expect(dbTouched.count).toBe(0);
    },
  );

  it.each([null, undefined, "text", "both"] as const)(
    "refuses an edit that leaves a stamp card with proofType %s",
    async (proofType) => {
      const result = await updateFestivalActivity(
        10,
        1,
        stampCard({ proofType }),
      );
      expect(result).toEqual({
        success: false,
        message: REQUIRED_PROOF_TYPE_MESSAGE,
      });
      expect(dbTouched.count).toBe(0);
    },
  );
});
