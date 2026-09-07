import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.hoisted(() => vi.fn());
const findManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: requireAdminMock,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      infractionTypes: {
        findMany: findManyMock,
      },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  changeInfractionTypeActivity,
  createInfractionType,
  fetchActiveInfractionTypes,
  fetchAllInfractionTypes,
  updateInfractionType,
} from "@/app/lib/infraction-types/actions";

describe("infraction type actions", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    findManyMock.mockReset();
  });

  it("independently authorizes every mutation", async () => {
    requireAdminMock.mockResolvedValue(null);

    await expect(
      createInfractionType({
        label: "Normas del stand",
        description:
          "Incluye personas sin credencial o más de dos personas detrás del stand.",
        severity: "medium",
      }),
    ).resolves.toMatchObject({ success: false, message: "No autorizado" });
    await expect(
      updateInfractionType({
        id: 1,
        label: "Normas del stand",
        description:
          "Incluye personas sin credencial o más de dos personas detrás del stand.",
        severity: "medium",
      }),
    ).resolves.toMatchObject({ success: false, message: "No autorizado" });
    await expect(
      changeInfractionTypeActivity({ id: 1, active: false }),
    ).resolves.toMatchObject({ success: false, message: "No autorizado" });
  });

  it("rejects unauthorized catalog reads", async () => {
    requireAdminMock.mockResolvedValue(null);

    await expect(fetchAllInfractionTypes()).rejects.toThrow("No autorizado");
    await expect(fetchActiveInfractionTypes()).rejects.toThrow("No autorizado");
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("propagates database failures instead of returning an empty catalog", async () => {
    requireAdminMock.mockResolvedValue({ id: 1, role: "admin" });
    findManyMock.mockRejectedValue(new Error("database unavailable"));

    await expect(fetchAllInfractionTypes()).rejects.toThrow(
      "database unavailable",
    );
    await expect(fetchActiveInfractionTypes()).rejects.toThrow(
      "database unavailable",
    );
  });
});
