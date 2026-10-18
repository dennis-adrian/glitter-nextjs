// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  findSectors: vi.fn(),
  select: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/app/vendors/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: mocks.profile,
  requireAdmin: vi.fn(async () => null),
  requireAdminOrFestivalAdmin: async () => {
    const profile = await mocks.profile();
    return profile?.role === "admin" || profile?.role === "festival_admin"
      ? profile
      : null;
  },
  requireProfileOwnerOrStaff: vi.fn(async () => null),
}));
vi.mock("@/db", () => ({
  db: {
    query: { festivalSectors: { findMany: mocks.findSectors } },
    select: (projection?: unknown) => {
      mocks.select(projection);
      return {
        from: () => ({
          where: async () => [
            {
              id: 7,
              displayName: "Tinta Viva",
              email: "tinta@example.com",
              category: "illustration",
            },
          ],
        }),
      };
    },
  },
}));

import { getFestivalAvailableUsers } from "@/app/lib/festivals/actions";

describe("getFestivalAvailableUsers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.mockResolvedValue({ id: 1, role: "festival_admin" });
    mocks.findSectors.mockResolvedValue([
      { id: 1, stands: [{ standCategory: "illustration" }] },
    ]);
  });

  it("reads only what the invitation screens render and send to", async () => {
    const users = await getFestivalAvailableUsers(1);

    expect(mocks.select).toHaveBeenCalledTimes(1);
    const projection = mocks.select.mock.calls[0][0] as Record<string, unknown>;
    // A bare `select()` returns the whole row: phone, birthdate, account ids.
    expect(projection).toBeDefined();
    expect(Object.keys(projection).sort()).toEqual([
      "category",
      "displayName",
      "email",
      "id",
    ]);
    expect(users).toEqual([
      {
        id: 7,
        displayName: "Tinta Viva",
        email: "tinta@example.com",
        category: "illustration",
      },
    ]);
  });

  it.each([
    ["a signed-out visitor", null],
    ["a participant", { id: 5, role: "user" }],
  ])("returns nothing to %s", async (_, profile) => {
    mocks.profile.mockResolvedValue(profile);

    expect(await getFestivalAvailableUsers(1)).toEqual([]);
    expect(mocks.findSectors).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
