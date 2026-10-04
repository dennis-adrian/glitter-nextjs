import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  release: vi.fn(),
  offset: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/app/lib/credits/service", () => ({
  releaseInvoiceCreditAllocationsInTx: mocks.release,
  offsetReleasedCreditsInTx: mocks.offset,
}));

import { releaseReservationInvoiceCreditsInTx } from "@/app/lib/reservations/repricing-refunds";

/**
 * A transaction whose only query is `standChangeRefundedAmount`'s sum, one
 * per wallet, answered in the ascending user order the release reads them.
 */
function refundsTx(refundedPerUser: number[]) {
  const where = vi.fn();
  for (const amount of refundedPerUser) {
    where.mockResolvedValueOnce([{ amount: String(amount) }]);
  }
  return { select: vi.fn(() => ({ from: vi.fn(() => ({ where })) })) };
}

function released(
  ...rows: { allocationId: number; userId: number; amount: number }[]
) {
  return {
    ok: true as const,
    released: rows.map((row) => ({
      ...row,
      ledgerEntryId: 1000 + row.allocationId,
    })),
  };
}

const INPUT = { reservationId: 7, invoiceId: 70, idempotencyKey: "k" };

describe("releaseReservationInvoiceCreditsInTx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.offset.mockImplementation(async (_tx, input) => ({
      ledgerEntryId: 5000 + input.userId,
    }));
  });

  it("passes a refusal through without reading or offsetting anything", async () => {
    mocks.release.mockResolvedValue({
      ok: false,
      code: "CREDITS_ALREADY_RELEASED",
    });
    const tx = refundsTx([]);

    expect(
      await releaseReservationInvoiceCreditsInTx(tx as never, INPUT),
    ).toEqual({ ok: false, code: "CREDITS_ALREADY_RELEASED" });
    expect(tx.select).not.toHaveBeenCalled();
    expect(mocks.offset).not.toHaveBeenCalled();
  });

  it("returns a release whole when nothing was refunded", async () => {
    mocks.release.mockResolvedValue(
      released({ allocationId: 1, userId: 3, amount: 500 }),
    );

    const result = await releaseReservationInvoiceCreditsInTx(
      refundsTx([0]) as never,
      INPUT,
    );

    expect(result).toMatchObject({
      ok: true,
      offsets: [],
      returnedAmount: 500,
    });
    expect(mocks.offset).not.toHaveBeenCalled();
  });

  /** Bs500 of credits, Bs200 refunded on a cheaper move: Bs300 comes back. */
  it("offsets the part of a release a refund already returned", async () => {
    mocks.release.mockResolvedValue(
      released({ allocationId: 1, userId: 3, amount: 500 }),
    );

    const result = await releaseReservationInvoiceCreditsInTx(
      refundsTx([200]) as never,
      INPUT,
    );

    expect(result).toMatchObject({
      ok: true,
      offsets: [{ userId: 3, amount: 200, ledgerEntryId: 5003 }],
      returnedAmount: 300,
    });
    expect(mocks.offset).toHaveBeenCalledWith(expect.anything(), {
      userId: 3,
      amount: 200,
      reason:
        "Diferencia a favor de la reserva #7 ya devuelta: se descuenta de los créditos devueltos del cobro #70",
      idempotencyKey: "repricing-refund-offset:70:k:3",
      metadata: { standChangeRefundReservationId: "7" },
    });
  });

  /**
   * A refund bigger than the credits released was funded by cash, which a
   * release never hands back: only what the credits cover is offset.
   */
  it("never offsets more than the wallet just got back", async () => {
    mocks.release.mockResolvedValue(
      released({ allocationId: 1, userId: 3, amount: 100 }),
    );

    const result = await releaseReservationInvoiceCreditsInTx(
      refundsTx([300]) as never,
      INPUT,
    );

    expect(result).toMatchObject({
      offsets: [{ userId: 3, amount: 100 }],
      returnedAmount: 0,
    });
  });

  it("nets each wallet against its own refunds, never somebody else's", async () => {
    mocks.release.mockResolvedValue(
      released(
        { allocationId: 2, userId: 9, amount: 150 },
        { allocationId: 1, userId: 3, amount: 200 },
        { allocationId: 3, userId: 3, amount: 100 },
      ),
    );

    // User 3 (read first) was refunded Bs250; user 9 nothing.
    const result = await releaseReservationInvoiceCreditsInTx(
      refundsTx([250, 0]) as never,
      INPUT,
    );

    expect(result).toMatchObject({
      offsets: [{ userId: 3, amount: 250 }],
      returnedAmount: 200,
    });
    expect(mocks.offset).toHaveBeenCalledTimes(1);
  });

  it("treats a refund an admin over-reverted as nothing to offset", async () => {
    mocks.release.mockResolvedValue(
      released({ allocationId: 1, userId: 3, amount: 500 }),
    );

    const result = await releaseReservationInvoiceCreditsInTx(
      refundsTx([-200]) as never,
      INPUT,
    );

    expect(result).toMatchObject({ offsets: [], returnedAmount: 500 });
  });

  /**
   * The release is already written by then. Returning a failure would let a
   * caller that returns rather than throws commit it without its offset.
   */
  it("throws when an offset cannot be posted", async () => {
    mocks.release.mockResolvedValue(
      released({ allocationId: 1, userId: 3, amount: 500 }),
    );
    mocks.offset.mockResolvedValue(null);

    await expect(
      releaseReservationInvoiceCreditsInTx(refundsTx([200]) as never, INPUT),
    ).rejects.toThrow("repricing_refund_offset_failed");
  });
});
