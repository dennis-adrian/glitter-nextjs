import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdminMock = vi.hoisted(() => vi.fn());
const assignmentLimitMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() =>
  vi.fn(() => ({
    from: vi.fn(() => ({
      where: vi.fn(() => ({ limit: assignmentLimitMock })),
    })),
  })),
);

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: requireAdminMock,
}));
vi.mock("@/db", () => ({ db: { select: selectMock } }));

import { requireFastPassFestivalAdmin } from "@/app/lib/fast-pass/admin-auth";

describe("FastPass festival administration", () => {
  beforeEach(() => {
    requireAdminMock.mockReset();
    assignmentLimitMock.mockReset();
    selectMock.mockClear();
  });

  it("allows global admins without an assignment lookup", async () => {
    const admin = { id: 1, role: "admin" };
    requireAdminMock.mockResolvedValue(admin);

    await expect(requireFastPassFestivalAdmin(20)).resolves.toBe(admin);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("allows only assigned festival admins", async () => {
    const festivalAdmin = { id: 2, role: "festival_admin" };
    requireAdminMock.mockResolvedValue(festivalAdmin);
    assignmentLimitMock.mockResolvedValueOnce([{ id: 7 }]);

    await expect(requireFastPassFestivalAdmin(20)).resolves.toBe(festivalAdmin);

    assignmentLimitMock.mockResolvedValueOnce([]);
    await expect(requireFastPassFestivalAdmin(21)).resolves.toBeNull();
  });
});
