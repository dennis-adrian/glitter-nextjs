import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const submitPaymentProofMock = vi.hoisted(() => vi.fn());
const submitZeroValueMock = vi.hoisted(() => vi.fn());
const findSubmittedMock = vi.hoisted(() => vi.fn());
const approveMock = vi.hoisted(() => vi.fn());
const rejectMock = vi.hoisted(() => vi.fn());
const cancelReservationMock = vi.hoisted(() => vi.fn());
const findFirstMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/app/lib/reservations/payment-service", () => ({
  submitPaymentProof: submitPaymentProofMock,
  submitZeroValueInvoiceForReview: submitZeroValueMock,
  findSubmittedSettlementId: findSubmittedMock,
  approveInvoiceSettlement: approveMock,
  rejectInvoiceSettlement: rejectMock,
}));

vi.mock("@/app/lib/reservations/admin-service", () => ({
  cancelReservation: cancelReservationMock,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      invoices: { findFirst: findFirstMock },
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/app/lib/uploadthing/actions", () => ({
  enqueueStorageCleanupJob: vi.fn(),
  attemptStorageCleanupJob: vi.fn(),
}));

import {
  adminAttachPaymentVoucher,
  confirmFreeInvoice,
  createPayment,
  updateInvoiceStatus,
} from "@/app/data/invoices/actions";

describe("invoice action delegation", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    submitPaymentProofMock.mockReset();
    submitZeroValueMock.mockReset();
    findSubmittedMock.mockReset();
    approveMock.mockReset();
    rejectMock.mockReset();
    cancelReservationMock.mockReset();
    findFirstMock.mockReset();
  });

  it("createPayment forwards normalized proof input to the payment service", async () => {
    submitPaymentProofMock.mockResolvedValue({
      success: true,
      data: { submissionId: 4 },
      message: "ok",
    });

    await createPayment({
      payment: {
        invoiceId: 9,
        voucherUrl: "https://files.example.com/f/abc",
      },
    });

    expect(submitPaymentProofMock).toHaveBeenCalledWith({
      invoiceId: 9,
      voucherUrl: "https://files.example.com/f/abc",
    });
  });

  it("confirmFreeInvoice forwards the invoice id to zero-value review", async () => {
    submitZeroValueMock.mockResolvedValue({
      success: true,
      data: { submissionId: 2 },
      message: "ok",
    });

    await confirmFreeInvoice({ invoiceId: 9 });
    expect(submitZeroValueMock).toHaveBeenCalledWith({ invoiceId: 9 });
  });

  it("updateInvoiceStatus approves the submitted settlement when marking paid", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    findSubmittedMock.mockResolvedValue(21);
    approveMock.mockResolvedValue({
      success: true,
      data: undefined,
      message: "La reserva fue confirmada.",
    });

    const result = await updateInvoiceStatus(9, "paid");
    expect(approveMock).toHaveBeenCalledWith({ submissionId: 21 });
    expect(result).toEqual({
      success: true,
      message: "La reserva fue confirmada.",
    });
  });

  it("updateInvoiceStatus rejects a submitted settlement back to pending", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    findSubmittedMock.mockResolvedValue(21);
    rejectMock.mockResolvedValue({
      success: true,
      data: undefined,
      message: "La solicitud fue rechazada.",
    });

    await updateInvoiceStatus(9, "pending");
    expect(rejectMock).toHaveBeenCalledWith({
      submissionId: 21,
      reason: "Revisión administrativa",
      correction: { type: "keep_amount" },
    });
  });

  it("updateInvoiceStatus cancels the reservation when there is no submitted settlement", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    findSubmittedMock.mockResolvedValue(null);
    findFirstMock.mockResolvedValue({ reservationId: 4 });
    cancelReservationMock.mockResolvedValue({
      success: true,
      message: "Reserva cancelada. El espacio quedó disponible.",
    });

    const result = await updateInvoiceStatus(9, "cancelled");
    expect(cancelReservationMock).toHaveBeenCalledWith({
      reservationId: 4,
      reason: "Cancelado desde el estado de pago",
    });
    expect(result.success).toBe(true);
  });

  it("adminAttachPaymentVoucher submits proof and optionally approves it", async () => {
    currentProfileMock.mockResolvedValue({ id: 1, role: "admin" });
    submitPaymentProofMock.mockResolvedValue({
      success: true,
      data: { submissionId: 8 },
      message: "ok",
    });
    approveMock.mockResolvedValue({
      success: true,
      data: undefined,
      message: "La reserva fue confirmada.",
    });

    const result = await adminAttachPaymentVoucher(
      9,
      "https://files.example.com/f/abc",
      true,
    );
    expect(submitPaymentProofMock).toHaveBeenCalledWith(
      { invoiceId: 9, voucherUrl: "https://files.example.com/f/abc" },
      { id: 1, role: "admin" },
    );
    expect(approveMock).toHaveBeenCalledWith({ submissionId: 8 });
    expect(result.success).toBe(true);
  });
});
