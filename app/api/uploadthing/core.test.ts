// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({ serverEnv: { RESEND_API_KEY: "re_test" } }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@clerk/nextjs/server", () => ({ currentUser: vi.fn() }));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdmin: vi.fn(),
  requireAdminOrFestivalAdmin: vi.fn(),
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: vi.fn(),
}));

import { ourFileRouter } from "@/app/api/uploadthing/core";
import { COMUNICADO_IMAGE_TYPES } from "@/app/lib/comunicados/definitions";
import { isFeatureEnabled } from "@/app/lib/feature_flags/helpers";
import { FESTIVAL_ARTWORK_TYPES } from "@/app/lib/festivals/artwork";
import {
  requireAdmin,
  requireAdminOrFestivalAdmin,
} from "@/app/lib/users/helpers";

const requireAdminMock = vi.mocked(requireAdmin);
const requireStaffMock = vi.mocked(requireAdminOrFestivalAdmin);
const isFeatureEnabledMock = vi.mocked(isFeatureEnabled);

type Route = {
  routerConfig: Record<string, unknown>;
  middleware: (args: { files: { name: string; type: string }[] }) => unknown;
  onUploadComplete: (args: {
    file: { url: string; ufsUrl: string };
    metadata: unknown;
  }) => unknown;
};
const festivalArtwork = ourFileRouter.festivalArtwork as unknown as Route;
const comunicadoImage = ourFileRouter.comunicadoImage as unknown as Route;

const poster = { name: "poster.png", type: "image/png" };

beforeEach(() => {
  requireAdminMock.mockReset();
  requireStaffMock.mockReset();
  isFeatureEnabledMock.mockReset();
});

describe("festivalArtwork upload route", () => {
  it("takes only the formats every mail client shows", () => {
    expect(Object.keys(festivalArtwork.routerConfig).sort()).toEqual(
      [...FESTIVAL_ARTWORK_TYPES].sort(),
    );
    expect(festivalArtwork.routerConfig).not.toHaveProperty("image");
  });

  it("takes one image from an admin", async () => {
    requireStaffMock.mockResolvedValue({ id: 3 } as never);
    await expect(
      festivalArtwork.middleware({ files: [poster] }),
    ).resolves.toEqual({ userId: 3 });
  });

  it("refuses a JPEG and a PNG together, which the per-type count allows", async () => {
    requireStaffMock.mockResolvedValue({ id: 3 } as never);
    await expect(
      festivalArtwork.middleware({
        files: [poster, { name: "poster.jpg", type: "image/jpeg" }],
      }),
    ).rejects.toThrow("Subí una sola imagen.");
  });

  it("refuses anyone who is not an admin", async () => {
    requireStaffMock.mockResolvedValue(null);
    await expect(
      festivalArtwork.middleware({ files: [poster] }),
    ).rejects.toThrow("No autorizado");
  });
});

describe("comunicadoImage upload route", () => {
  const admin = { id: 3, role: "admin" };
  const photo = { name: "armado.jpg", type: "image/jpeg" };

  it("takes JPEG and PNG of up to 4 MB, one at a time, and nothing else", () => {
    expect(Object.keys(comunicadoImage.routerConfig).sort()).toEqual(
      [...COMUNICADO_IMAGE_TYPES].sort(),
    );
    expect(comunicadoImage.routerConfig).not.toHaveProperty("image");
    expect(comunicadoImage.routerConfig).not.toHaveProperty("image/webp");
    for (const type of COMUNICADO_IMAGE_TYPES) {
      expect(comunicadoImage.routerConfig[type], type).toEqual({
        maxFileSize: "4MB",
        maxFileCount: 1,
      });
    }
  });

  it("takes one image from a global admin with the comunicados flag", async () => {
    requireAdminMock.mockResolvedValue(admin as never);
    isFeatureEnabledMock.mockResolvedValue(true);

    await expect(
      comunicadoImage.middleware({ files: [photo] }),
    ).resolves.toEqual({ userId: 3 });
    // The flag is read for the admin already loaded, not looked up again.
    expect(isFeatureEnabledMock).toHaveBeenCalledWith("comunicados", admin);
  });

  it("refuses a festival admin, whom the poster route takes", async () => {
    requireStaffMock.mockResolvedValue({
      id: 5,
      role: "festival_admin",
    } as never);
    requireAdminMock.mockResolvedValue(null);
    isFeatureEnabledMock.mockResolvedValue(true);

    await expect(
      comunicadoImage.middleware({ files: [photo] }),
    ).rejects.toThrow("No autorizado");
  });

  it("refuses an admin while the comunicados flag is off for them", async () => {
    requireAdminMock.mockResolvedValue(admin as never);
    isFeatureEnabledMock.mockResolvedValue(false);

    await expect(
      comunicadoImage.middleware({ files: [photo] }),
    ).rejects.toThrow("No autorizado");
  });

  it("refuses a JPEG and a PNG together, which the per-type count allows", async () => {
    requireAdminMock.mockResolvedValue(admin as never);
    isFeatureEnabledMock.mockResolvedValue(true);

    await expect(
      comunicadoImage.middleware({ files: [photo, poster] }),
    ).rejects.toThrow("Subí una sola imagen.");
  });

  it("answers with the file's ufs.sh address", () => {
    expect(
      comunicadoImage.onUploadComplete({
        file: {
          url: "https://utfs.io/f/KEY",
          ufsUrl: "https://abc123.ufs.sh/f/KEY",
        },
        metadata: { userId: 3 },
      }),
    ).toEqual({ imageUrl: "https://abc123.ufs.sh/f/KEY" });
  });
});
