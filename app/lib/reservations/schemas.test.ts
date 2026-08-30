import { describe, expect, it } from "vitest";

import {
  parseConfirmHoldInput,
  parseHoldStandInput,
  parseUnknown,
  submitPaymentProofSchema,
} from "@/app/lib/reservations/schemas";

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

  it("accepts a hold stand id as a number or as an object with a UUID key", () => {
    expect(parseHoldStandInput(7)).toEqual({
      success: true,
      data: { standId: 7 },
    });
    expect(
      parseHoldStandInput({
        standId: 7,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      success: true,
      data: {
        standId: 7,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      },
    });
    expect(
      parseHoldStandInput({
        standId: 7,
        idempotencyKey: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("accepts confirm input as positional ids or a keyed object", () => {
    expect(parseConfirmHoldInput(20, 4)).toEqual({
      success: true,
      data: { holdId: 20, partnerId: 4 },
    });
    expect(
      parseConfirmHoldInput({
        holdId: 20,
        partnerId: 4,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      success: true,
      data: {
        holdId: 20,
        partnerId: 4,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      },
    });
  });
});
