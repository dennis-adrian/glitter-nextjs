import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));
vi.mock("@/db", () => ({
  db: { select: selectMock, transaction: vi.fn() },
}));
vi.mock("@/app/lib/credits/service", () => ({
  readCreditBalances: vi.fn(),
}));

import { fetchFeatureHolds } from "@/app/lib/credits/queries";

const ROW = {
  featureActionId: 1,
  festivalId: 619,
  festivalName: "Glitter ¡Feliz Cumple!",
  amount: "20.00",
  status: "active" as const,
  createdAt: new Date("2026-09-04T10:00:00Z"),
  updatedAt: new Date("2026-09-04T11:00:00Z"),
};

/** Minimal Drizzle stand-in: every builder method returns the same thenable. */
function installSelect(rows: Record<string, unknown>[]) {
  selectMock.mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    for (const name of ["from", "innerJoin", "where", "orderBy"]) {
      builder[name] = () => builder;
    }
    builder.then = (resolve: (value: unknown) => unknown) => resolve(rows);
    return builder;
  });
}

describe("fetchFeatureHolds", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    selectMock.mockReset();
    installSelect([ROW]);
  });

  it("returns the participant's own earmarks", async () => {
    currentProfileMock.mockResolvedValue({ id: 42, role: "user" });

    const holds = await fetchFeatureHolds(42);

    expect(holds).toEqual([
      {
        featureActionId: 1,
        festivalId: 619,
        festivalName: "Glitter ¡Feliz Cumple!",
        amount: 20,
        status: "active",
        reservedAt: ROW.createdAt,
        closedAt: null,
      },
    ]);
  });

  /**
   * This says what somebody activated, where, and for how much. The admin
   * credit card reads it for the participant being looked at, so admins keep
   * access — the same rule `fetchCreditWallet` applies.
   */
  it("lets an admin read another participant's earmarks", async () => {
    currentProfileMock.mockResolvedValue({ id: 7, role: "admin" });

    expect(await fetchFeatureHolds(42)).toHaveLength(1);
  });

  it("refuses another participant's earmarks", async () => {
    currentProfileMock.mockResolvedValue({ id: 7, role: "user" });

    expect(await fetchFeatureHolds(42)).toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("refuses a signed-out caller", async () => {
    currentProfileMock.mockResolvedValue(null);

    expect(await fetchFeatureHolds(42)).toEqual([]);
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("dates a closed earmark from its status change", async () => {
    currentProfileMock.mockResolvedValue({ id: 42, role: "user" });
    installSelect([{ ...ROW, status: "released" }]);

    expect(await fetchFeatureHolds(42)).toMatchObject([
      { status: "released", closedAt: ROW.updatedAt },
    ]);
  });
});
