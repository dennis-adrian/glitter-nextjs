import { describe, expect, it } from "vitest";

import {
  parseConfirmHoldInput,
  parseHoldStandInput,
  parseUnknown,
  rejectSettlementSchema,
  submitPaymentProofSchema,
  submitZeroValueInvoiceSchema,
  updateReservationPartnerSchema,
} from "@/app/lib/reservations/schemas";

const SAMPLE_KEY = "11111111-1111-4111-8111-111111111111";

describe("reservation runtime schemas", () => {
  it("accepts invoiceId plus voucher URL and strips unknown payment identity fields", () => {
    const parsed = parseUnknown(submitPaymentProofSchema, {
      invoiceId: 12,
      voucherUrl: "https://files.example.com/f/abc",
      idempotencyKey: SAMPLE_KEY,
      amount: 1,
      standId: 99,
      reservationId: 123,
    });
    expect(parsed).toEqual({
      success: true,
      data: {
        invoiceId: 12,
        voucherUrl: "https://files.example.com/f/abc",
        idempotencyKey: SAMPLE_KEY,
      },
    });
  });

  it("accepts payment proof when fileKey is the durable request identity", () => {
    expect(
      parseUnknown(submitPaymentProofSchema, {
        invoiceId: 12,
        voucherUrl: "https://files.example.com/f/abc",
        fileKey: "uploadthing-key",
      }).success,
    ).toBe(true);
  });

  it("rejects payment proof without idempotencyKey or fileKey", () => {
    expect(
      parseUnknown(submitPaymentProofSchema, {
        invoiceId: 12,
        voucherUrl: "https://files.example.com/f/abc",
      }).success,
    ).toBe(false);
  });

  it("rejects a non-positive invoice id", () => {
    expect(
      parseUnknown(submitPaymentProofSchema, {
        invoiceId: 0,
        voucherUrl: "https://files.example.com/f/abc",
        idempotencyKey: SAMPLE_KEY,
      }).success,
    ).toBe(false);
  });

  it("requires a hold stand id object with a UUID key", () => {
    expect(parseHoldStandInput(7).success).toBe(false);
    expect(
      parseHoldStandInput({
        standId: 7,
        idempotencyKey: SAMPLE_KEY,
      }),
    ).toEqual({
      success: true,
      data: {
        standId: 7,
        idempotencyKey: SAMPLE_KEY,
      },
    });
    expect(
      parseHoldStandInput({
        standId: 7,
        idempotencyKey: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("accepts structured confirm input with a partner and idempotency key", () => {
    expect(
      parseConfirmHoldInput({
        holdId: 20,
        partnerId: 4,
        idempotencyKey: SAMPLE_KEY,
      }),
    ).toEqual({
      success: true,
      data: {
        holdId: 20,
        partnerId: 4,
        idempotencyKey: SAMPLE_KEY,
      },
    });
    expect(parseConfirmHoldInput(20).success).toBe(false);
  });

  it("accepts zero-value review and settlement rejection corrections", () => {
    expect(
      parseUnknown(submitZeroValueInvoiceSchema, {
        invoiceId: 9,
        idempotencyKey: SAMPLE_KEY,
      }),
    ).toEqual({
      success: true,
      data: { invoiceId: 9, idempotencyKey: SAMPLE_KEY },
    });
    expect(
      parseUnknown(rejectSettlementSchema, {
        submissionId: 3,
        reason: "El monto no coincide",
        correction: { type: "keep_amount" },
      }).success,
    ).toBe(true);
    expect(
      parseUnknown(rejectSettlementSchema, {
        submissionId: 3,
        reason: "Restaurar",
        correction: { type: "restore_amount" },
      }).success,
    ).toBe(true);
    expect(
      parseUnknown(rejectSettlementSchema, {
        submissionId: 3,
        reason: "Cancelar",
        correction: { type: "cancel_reservation" },
      }).success,
    ).toBe(true);
  });

  it("accepts a nullable partner user id for admin partner edits", () => {
    expect(
      parseUnknown(updateReservationPartnerSchema, {
        reservationId: 9,
        partnerUserId: 4,
      }),
    ).toEqual({
      success: true,
      data: { reservationId: 9, partnerUserId: 4 },
    });
    expect(
      parseUnknown(updateReservationPartnerSchema, {
        reservationId: 9,
        partnerUserId: null,
      }),
    ).toEqual({
      success: true,
      data: { reservationId: 9, partnerUserId: null },
    });
    expect(
      parseUnknown(updateReservationPartnerSchema, {
        reservationId: 9,
      }).success,
    ).toBe(false);
  });
});
