import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const adminConfirmReservationMock = vi.hoisted(() => vi.fn());
const findSubmittedSettlementInvoiceIdForReservationMock = vi.hoisted(() =>
  vi.fn(),
);
const selectMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/reservations/payment-service", () => ({
  adminConfirmReservation: adminConfirmReservationMock,
  approveInvoiceSettlement: vi.fn(),
  findSubmittedSettlementId: vi.fn(),
  findSubmittedSettlementInvoiceIdForReservation:
    findSubmittedSettlementInvoiceIdForReservationMock,
  rejectInvoiceSettlement: vi.fn(),
  submitZeroValueInvoiceForReview: vi.fn(),
}));

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: vi.fn(),
}));

vi.mock("@/app/lib/reservations/policy", () => ({
  canMutateAdminReservations: vi.fn(),
}));

vi.mock("@/app/lib/reservations/admin-service", () => ({
  cancelReservation: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
    query: {
      invoices: { findFirst: vi.fn() },
    },
  },
}));

import * as paymentActions from "@/app/lib/reservations/payment-actions";

const { adminConfirmReservationByReservationIdAction } = paymentActions;

const CONFIRM_KEY = "11111111-1111-4111-8111-111111111111";

function selectChain(rows: unknown[]) {
  const thenable = Object.assign(Promise.resolve(rows), {
    limit: vi.fn(() => Promise.resolve(rows)),
  });
  return {
    from: vi.fn(() => ({
      where: vi.fn(() => thenable),
    })),
  };
}

describe("adminConfirmReservationByReservationIdAction", () => {
  beforeEach(() => {
    adminConfirmReservationMock.mockReset();
    findSubmittedSettlementInvoiceIdForReservationMock.mockReset();
    selectMock.mockReset();
    adminConfirmReservationMock.mockResolvedValue({
      success: true,
      message: "La reserva fue confirmada.",
    });
  });

  it("confirms the invoice linked to the submitted settlement, not another invoice on the reservation", async () => {
    findSubmittedSettlementInvoiceIdForReservationMock.mockResolvedValue(20);
    selectMock.mockReturnValue(selectChain([{ id: 10 }]));

    const result = await adminConfirmReservationByReservationIdAction({
      reservationId: 4,
      idempotencyKey: CONFIRM_KEY,
    });

    expect(
      findSubmittedSettlementInvoiceIdForReservationMock,
    ).toHaveBeenCalledWith(4);
    expect(selectMock).not.toHaveBeenCalled();
    expect(adminConfirmReservationMock).toHaveBeenCalledWith({
      invoiceId: 20,
      idempotencyKey: CONFIRM_KEY,
    });
    expect(result).toEqual({
      success: true,
      message: "La reserva fue confirmada.",
    });
  });

  it("falls back to the reservation invoice when there is no submitted settlement", async () => {
    findSubmittedSettlementInvoiceIdForReservationMock.mockResolvedValue(null);
    selectMock.mockReturnValue(selectChain([{ id: 10 }]));

    await adminConfirmReservationByReservationIdAction({
      reservationId: 4,
      idempotencyKey: CONFIRM_KEY,
    });

    expect(adminConfirmReservationMock).toHaveBeenCalledWith({
      invoiceId: 10,
      idempotencyKey: CONFIRM_KEY,
    });
  });

  it("does not confirm when the reservation has no invoice", async () => {
    findSubmittedSettlementInvoiceIdForReservationMock.mockResolvedValue(null);
    selectMock.mockReturnValue(selectChain([]));

    const result = await adminConfirmReservationByReservationIdAction({
      reservationId: 4,
      idempotencyKey: CONFIRM_KEY,
    });

    expect(adminConfirmReservationMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      success: false,
      message: "No se encontró la factura de la reserva.",
    });
  });
});

describe("payment action export surface", () => {
  it("does not expose participant payment-proof submission", () => {
    expect(paymentActions).not.toHaveProperty("submitPaymentProofAction");
  });
});
