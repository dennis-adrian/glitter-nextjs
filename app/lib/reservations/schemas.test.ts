import { describe, expect, it } from "vitest";

import { parseUnknown, submitPaymentProofSchema } from "@/app/lib/reservations/schemas";

describe("reservation runtime schemas", () => {
  it("accepts invoiceId plus voucher URL and strips unknown payment identity fields", () => {
    const parsed = parseUnknown(submitPaymentProofSchema, {
      invoiceId: 12,
      voucherUrl: "https://files.example.com/f/abc",
      amount: 1,
      standId: 99,
      reservationId: 123,
    });
    expect(parsed).toEqual({
      success: true,
      data: {
        invoiceId: 12,
        voucherUrl: "https://files.example.com/f/abc",
      },
    });
  });

  it("rejects a non-positive invoice id", () => {
    expect(
      parseUnknown(submitPaymentProofSchema, {
        invoiceId: 0,
        voucherUrl: "https://files.example.com/f/abc",
      }).success,
    ).toBe(false);
  });
});
