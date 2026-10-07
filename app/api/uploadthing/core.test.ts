// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: { RESEND_API_KEY: "re_test" } }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: vi.fn(),
}));

import { ourFileRouter } from "@/app/api/uploadthing/core";
import { FESTIVAL_ARTWORK_TYPES } from "@/app/lib/festivals/artwork";
import { requireAdminOrFestivalAdmin } from "@/app/lib/users/helpers";

const requireAdmin = vi.mocked(requireAdminOrFestivalAdmin);

type Route = {
  routerConfig: Record<string, unknown>;
  middleware: (args: { files: { name: string; type: string }[] }) => unknown;
};
const festivalArtwork = ourFileRouter.festivalArtwork as unknown as Route;

const poster = { name: "poster.png", type: "image/png" };

beforeEach(() => {
  requireAdmin.mockReset();
});

describe("festivalArtwork upload route", () => {
  it("takes only the formats every mail client shows", () => {
    expect(Object.keys(festivalArtwork.routerConfig).sort()).toEqual(
      [...FESTIVAL_ARTWORK_TYPES].sort(),
    );
    expect(festivalArtwork.routerConfig).not.toHaveProperty("image");
  });

  it("takes one image from an admin", async () => {
    requireAdmin.mockResolvedValue({ id: 3 } as never);
    await expect(
      festivalArtwork.middleware({ files: [poster] }),
    ).resolves.toEqual({ userId: 3 });
  });

  it("refuses a JPEG and a PNG together, which the per-type count allows", async () => {
    requireAdmin.mockResolvedValue({ id: 3 } as never);
    await expect(
      festivalArtwork.middleware({
        files: [poster, { name: "poster.jpg", type: "image/jpeg" }],
      }),
    ).rejects.toThrow("Subí una sola imagen.");
  });

  it("refuses anyone who is not an admin", async () => {
    requireAdmin.mockResolvedValue(null);
    await expect(
      festivalArtwork.middleware({ files: [poster] }),
    ).rejects.toThrow("No autorizado");
  });
});
