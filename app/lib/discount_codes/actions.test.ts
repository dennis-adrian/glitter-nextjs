import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const transactionMock = vi.hoisted(() => vi.fn());
const consumeActionRateLimitMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    transaction: transactionMock,
    query: {
      discountCodes: { findMany: vi.fn(), findFirst: vi.fn() },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: consumeActionRateLimitMock,
}));

vi.mock("@/app/lib/reservations/locks", () => ({
  lockFestivalRow: vi.fn(),
  lockFestivalTermsDocument: vi.fn(),
  lockParticipantEligibilityRows: vi.fn(),
  lockParticipants: vi.fn(),
  lockStandRows: vi.fn(),
}));

import {
  createDiscountCode,
  fetchDiscountCodes,
  validateAndApplyDiscountCode,
} from "@/app/lib/discount_codes/actions";
import {
  lockFestivalRow,
  lockFestivalTermsDocument,
  lockParticipantEligibilityRows,
  lockParticipants,
  lockStandRows,
} from "@/app/lib/reservations/locks";

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

describe("discount code admin authorization", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
  });

  it("rejects festival_admin create and list", async () => {
    currentProfileMock.mockResolvedValue({ id: 2, role: "festival_admin" });
    await expect(
      createDiscountCode({
        code: "FREE",
        discountUnit: "percentage",
        discountValue: 100,
        expiresAt: new Date("2027-01-01"),
      } as never),
    ).resolves.toMatchObject({ success: false });
    await expect(fetchDiscountCodes()).resolves.toEqual([]);
  });

  it("rejects unauthenticated create", async () => {
    currentProfileMock.mockResolvedValue(null);
    await expect(
      createDiscountCode({
        code: "FREE",
        discountUnit: "percentage",
        discountValue: 100,
        expiresAt: new Date("2027-01-01"),
      } as never),
    ).resolves.toMatchObject({ success: false });
  });
});

describe("validateAndApplyDiscountCode lock order", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    transactionMock.mockReset();
    consumeActionRateLimitMock.mockReset();
    vi.mocked(lockFestivalRow).mockReset();
    vi.mocked(lockFestivalTermsDocument).mockReset();
    vi.mocked(lockParticipantEligibilityRows).mockReset();
    vi.mocked(lockParticipants).mockReset();
    vi.mocked(lockStandRows).mockReset();
    consumeActionRateLimitMock.mockResolvedValue(true);
  });

  it("locks participant, festival, eligibility rows, then stand before the invoice", async () => {
    currentProfileMock.mockResolvedValue({ id: 5, role: "user" });
    const order: string[] = [];
    vi.mocked(lockParticipants).mockImplementation(async () => {
      order.push("participants");
    });
    vi.mocked(lockFestivalRow).mockImplementation(async () => {
      order.push("festival");
      return null;
    });
    vi.mocked(lockFestivalTermsDocument).mockImplementation(async () => {
      order.push("terms");
    });
    vi.mocked(lockParticipantEligibilityRows).mockImplementation(async () => {
      order.push("eligibilityRows");
    });
    vi.mocked(lockStandRows).mockImplementation(async () => {
      order.push("stand");
      return [];
    });

    const invoicePreview = {
      id: 10,
      userId: 5,
      festivalId: 3,
      standId: 8,
    };
    const select = vi
      .fn()
      .mockImplementationOnce(() => selectChain([invoicePreview]))
      .mockImplementationOnce(() => selectChain([]));
    const tx = { select };
    transactionMock.mockImplementation(
      async (callback: (value: unknown) => unknown) => callback(tx),
    );

    const result = await validateAndApplyDiscountCode({
      code: "SAVE10",
      invoiceId: 10,
    });

    expect(result).toMatchObject({ success: false });
    expect(order).toEqual([
      "participants",
      "festival",
      "terms",
      "eligibilityRows",
      "stand",
    ]);
    expect(lockParticipants).toHaveBeenCalledWith(tx, 3, [5]);
    expect(lockFestivalRow).toHaveBeenCalledWith(tx, 3);
    expect(lockParticipantEligibilityRows).toHaveBeenCalledWith(tx, 3, [5]);
    expect(lockStandRows).toHaveBeenCalledWith(tx, [8]);
    expect(select).toHaveBeenCalledTimes(2);
  });
});
