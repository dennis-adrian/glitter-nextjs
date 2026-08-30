import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const authMock = vi.hoisted(() => vi.fn());
const denySelfServiceMock = vi.hoisted(() => vi.fn());
const denyStandMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: authMock,
}));

vi.mock("@/app/lib/reservations/tx-eligibility", () => ({
  denySelfServiceMutation: denySelfServiceMock,
  denyIfStandNotEligibleForProfile: denyStandMock,
}));

vi.mock("@/app/api/users/actions", () => ({
  fetchAdminUsers: vi.fn().mockResolvedValue([]),
  fetchBaseProfileById: vi.fn(),
}));

vi.mock("@/app/api/stands/actions", () => ({
  fetchStandById: vi.fn(),
}));

vi.mock("@/app/lib/festivals/actions", () => ({
  fetchBaseFestival: vi.fn(),
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: transactionMock,
    query: {
      standHolds: {
        findFirst: vi.fn(),
      },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import {
  confirmStandHold,
  createStandHold,
} from "@/app/lib/stands/hold-actions";
import { reservationFailure } from "@/app/lib/reservations/errors";

function selectChain(rows: unknown[]) {
  const thenable = Object.assign(Promise.resolve(rows), {
    limit: vi.fn(() =>
      Object.assign(Promise.resolve(rows), {
        for: vi.fn().mockResolvedValue(rows),
      }),
    ),
  });
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => thenable),
      innerJoin: vi.fn(() => ({
        where: vi.fn(() => thenable),
      })),
    })),
  };
}

const availableStand = {
  id: 7,
  status: "available",
  festivalId: 10,
  standCategory: "illustration",
  participationType: "standard",
  price: 100,
};

describe("stand hold authorization and eligibility wiring", () => {
  beforeEach(() => {
    authMock.mockReset();
    denySelfServiceMock.mockReset();
    denyStandMock.mockReset();
    transactionMock.mockReset();
    denySelfServiceMock.mockResolvedValue(null);
    denyStandMock.mockResolvedValue(null);
  });

  it("rejects unauthenticated hold creation", async () => {
    authMock.mockResolvedValue(null);
    const result = await createStandHold(7);
    expect(result).toMatchObject({
      success: false,
      code: "UNAUTHENTICATED",
    });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("rejects a missing stand", async () => {
    authMock.mockResolvedValue({ id: 3, role: "user", status: "verified" });
    const tx = {
      select: vi.fn(() => selectChain([])),
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await createStandHold(7);
    expect(result).toMatchObject({ success: false, code: "STAND_NOT_FOUND" });
  });

  it("does not insert a hold when canonical eligibility denies the actor", async () => {
    authMock.mockResolvedValue({ id: 3, role: "user", status: "verified" });
    denySelfServiceMock.mockResolvedValue(
      reservationFailure("SANCTION_BLOCKED"),
    );
    const insert = vi.fn();
    const select = vi
      .fn()
      .mockImplementationOnce(() => selectChain([availableStand]))
      .mockImplementationOnce(() => selectChain([]))
      .mockImplementationOnce(() => selectChain([availableStand]));
    const tx = {
      select,
      insert,
      delete: vi.fn(),
      update: vi.fn(),
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await createStandHold(7);

    expect(result).toMatchObject({
      success: false,
      code: "SANCTION_BLOCKED",
    });
    expect(denySelfServiceMock).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ userId: 3, festivalId: 10 }),
    );
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects confirmation when the partner is ineligible", async () => {
    authMock.mockResolvedValue({ id: 3, role: "user", status: "verified" });
    denySelfServiceMock
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(reservationFailure("PARTNER_NOT_ELIGIBLE"));
    const insert = vi.fn();
    const tx = {
      select: vi.fn(() =>
        selectChain([
          {
            id: 20,
            standId: 7,
            festivalId: 10,
            userId: 3,
            standFestivalId: 10,
            standPrice: 100,
            standStatus: "held",
            standCategory: "illustration",
            participationType: "standard",
          },
        ]),
      ),
      insert,
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await confirmStandHold(20, 4);

    expect(result).toMatchObject({
      success: false,
      code: "PARTNER_NOT_ELIGIBLE",
    });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects festival_admin self-service holds when policy denies the session actor", async () => {
    authMock.mockResolvedValue({
      id: 1,
      role: "festival_admin",
      status: "verified",
    });
    denySelfServiceMock.mockResolvedValue(reservationFailure("UNAUTHORIZED"));
    const insert = vi.fn();
    const select = vi
      .fn()
      .mockImplementationOnce(() => selectChain([availableStand]))
      .mockImplementationOnce(() => selectChain([]))
      .mockImplementationOnce(() => selectChain([availableStand]));
    const tx = {
      select,
      insert,
    };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await createStandHold(7);
    expect(result).toMatchObject({ success: false, code: "UNAUTHORIZED" });
    expect(insert).not.toHaveBeenCalled();
  });
});
