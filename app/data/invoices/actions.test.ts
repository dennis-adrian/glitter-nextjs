import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const submitZeroValueMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
}));

vi.mock("@/app/lib/reservations/payment-service", () => ({
  submitZeroValueInvoiceForReview: submitZeroValueMock,
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      invoices: { findFirst: vi.fn() },
    },
  },
}));

import { confirmFreeInvoice } from "@/app/data/invoices/actions";
import * as invoiceActions from "@/app/data/invoices/actions";

describe("invoice action delegation", () => {
  beforeEach(() => {
    currentProfileMock.mockReset();
    submitZeroValueMock.mockReset();
  });

  it("does not export legacy payment mutation helpers", () => {
    expect(invoiceActions).not.toHaveProperty("createPayment");
    expect(invoiceActions).not.toHaveProperty("updateInvoiceStatus");
    expect(invoiceActions).not.toHaveProperty("adminRemovePaymentVoucher");
  });

  it("confirmFreeInvoice forwards to zero-value review", async () => {
    submitZeroValueMock.mockResolvedValue({
      success: true,
      data: { submissionId: 4 },
      message: "ok",
    });
    await confirmFreeInvoice({ invoiceId: 9 });
    expect(submitZeroValueMock).toHaveBeenCalledWith({ invoiceId: 9 });
  });
});
