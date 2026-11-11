// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const actor = vi.hoisted(() => ({ id: 1, role: "admin" }));
const festivalSets = vi.hoisted(() => [] as Record<string, unknown>[]);
const reservationsStartDate = vi.hoisted(
  () => new Date("2026-10-01T12:00:00Z"),
);

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
  cacheTag: vi.fn(),
  cacheLife: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/app/lib/emails/recorded-send", async () =>
  (await import("@/app/lib/emails/recorded-send.testing")).passThrough(),
);
vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
  sendBatchEmails: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => actor,
  requireAdmin: async () => actor,
  requireAdminOrFestivalAdmin: async () => actor,
  requireProfileOwnerOrStaff: async () => actor,
}));

/**
 * A query builder that records what the festival update writes. Every chained
 * call returns the builder; awaiting it yields the locked festival row for the
 * `for update` select, the written row for the update, and [] otherwise.
 */
function query(kind: "select" | "update") {
  let result: unknown[] = [];
  const builder: Record<string, unknown> = {};
  const chain = new Proxy(builder, {
    get(_target, prop) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) => resolve(result);
      }
      return (...args: unknown[]) => {
        if (kind === "select" && prop === "for") {
          result = [{ id: 7, status: "draft", reservationsStartDate }];
        }
        if (kind === "update" && prop === "set") {
          festivalSets.push(args[0] as Record<string, unknown>);
          result = [{ id: 7, ...(args[0] as object) }];
        }
        return chain;
      };
    },
  });
  return chain;
}

vi.mock("@/db", () => {
  const tx = {
    select: () => query("select"),
    update: () => query("update"),
    insert: () => query("update"),
    delete: () => query("select"),
  };
  return {
    db: {
      transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { updateFestival } from "@/app/lib/festivals/actions";

const formData = {
  id: 7,
  name: "Festicker",
  festivalType: "glitter" as const,
  reservationsStartDate,
  festivalBannerUrl: "https://utfs.io/f/wide.png",
  festivalBannerMobileUrl: "https://utfs.io/f/phone.png",
};

describe("updateFestival and the phone banner", () => {
  beforeEach(() => {
    festivalSets.length = 0;
  });

  it("keeps both banners across a save that carries them back", async () => {
    const result = await updateFestival(formData);

    expect(result.success).toBe(true);
    expect(festivalSets).toHaveLength(1);
    expect(festivalSets[0]).toMatchObject({
      festivalBannerUrl: "https://utfs.io/f/wide.png",
      festivalBannerMobileUrl: "https://utfs.io/f/phone.png",
    });
  });

  it("clears the phone banner when the form sends it empty", async () => {
    // The form sends "" for a removed image; the column stores NULL, which
    // makes phones fall back to the wide banner.
    await updateFestival({ ...formData, festivalBannerMobileUrl: "" });

    expect(festivalSets[0]).toMatchObject({
      festivalBannerUrl: "https://utfs.io/f/wide.png",
      festivalBannerMobileUrl: null,
    });
  });
});
