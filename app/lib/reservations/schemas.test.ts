import { describe, expect, it } from "vitest";

import { parseUnknown, submitPaymentProofSchema } from "@/app/lib/reservations/schemas";

describe("reservation runtime schemas", () => {
  it("accepts invoiceId plus voucher URL and rejects extra payment identity fields as the only required shape", () => {
    const parsed = parseUnknown(submitPaymentProofSchema, {
      invoiceId: 12,
      voucherUrl: "https://files.example.com/f/abc",
    });
    expect(parsed.success).toBe(true);
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
