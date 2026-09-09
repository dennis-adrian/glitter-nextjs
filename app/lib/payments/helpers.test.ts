import { describe, expect, it } from "vitest";

import {
  canAcceptInvoiceProof,
  countOutstandingInvoices,
  getInvoiceStatusLabel,
  findLatestActivePaymentProof,
  isActivePaymentProof,
  resolveReservationPaymentUpload,
} from "@/app/lib/payments/helpers";

describe("invoice settlement status", () => {
  it("treats only pending invoices as outstanding", () => {
    expect(
      countOutstandingInvoices([
        { status: "pending" },
        { status: "verification_payment" },
        { status: "paid" },
      ]),
    ).toBe(1);
  });

  it("allows a new or replacement proof while pending or under review", () => {
    expect(canAcceptInvoiceProof("pending")).toBe(true);
    expect(canAcceptInvoiceProof("verification_payment")).toBe(true);
    expect(canAcceptInvoiceProof("paid")).toBe(false);
    expect(canAcceptInvoiceProof("cancelled")).toBe(false);
  });

  it("labels verification_payment as En revisión", () => {
    expect(getInvoiceStatusLabel("verification_payment")).toBe("En revisión");
  });
});

describe("isActivePaymentProof", () => {
  it("requires both voucherUrl and fileKey", () => {
    expect(
      isActivePaymentProof({
        voucherUrl: "https://files.example.com/voucher.pdf",
        fileKey: "uploadthing-key",
      }),
    ).toBe(true);
    expect(
      isActivePaymentProof({
        voucherUrl: "https://files.example.com/voucher.pdf",
        fileKey: null,
      }),
    ).toBe(false);
    expect(
      isActivePaymentProof({
        voucherUrl: "",
        fileKey: "uploadthing-key",
      }),
    ).toBe(false);
  });
});

describe("findLatestActivePaymentProof", () => {
  it("returns the newest active payment proof regardless of array order", () => {
    const older = {
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      voucherUrl: "https://files.example.com/old.pdf",
      fileKey: "old-key",
    };
    const newer = {
      createdAt: new Date("2026-01-02T00:00:00.000Z"),
      voucherUrl: "https://files.example.com/new.pdf",
      fileKey: "new-key",
    };

    expect(findLatestActivePaymentProof([newer, older])).toEqual(newer);
    expect(findLatestActivePaymentProof([older, newer])).toEqual(newer);
  });

  it("skips inactive proofs and returns undefined when none are active", () => {
    expect(
      findLatestActivePaymentProof([
        {
          createdAt: new Date("2026-01-01T00:00:00.000Z"),
          voucherUrl: "https://files.example.com/voucher.pdf",
          fileKey: null,
        },
      ]),
    ).toBeUndefined();
  });
});

describe("resolveReservationPaymentUpload", () => {
  const owner = { id: 8, role: "user" };
  const admin = { id: 1, role: "admin" };
  const pendingInvoice = {
    id: 9,
    userId: 8,
    status: "pending" as const,
    reservation: { status: "pending" },
  };

  it("allows the owner to upload while invoice and reservation are still open", () => {
    expect(
      resolveReservationPaymentUpload({
        invoice: pendingInvoice,
        profile: owner,
      }),
    ).toEqual({ ok: true, invoiceId: 9 });
  });

  it("rejects participant uploads after the reservation is accepted", () => {
    expect(
      resolveReservationPaymentUpload({
        invoice: {
          ...pendingInvoice,
          reservation: { status: "accepted" },
        },
        profile: owner,
      }),
    ).toEqual({
      ok: false,
      message: "Esta reserva ya no admite un comprobante",
    });
  });

  it("rejects participant uploads after the invoice is paid", () => {
    expect(
      resolveReservationPaymentUpload({
        invoice: { ...pendingInvoice, status: "paid" },
        profile: owner,
      }),
    ).toEqual({
      ok: false,
      message: "Este cobro ya no admite un comprobante",
    });
  });

  it("still enforces status checks when an admin uses the participant path", () => {
    expect(
      resolveReservationPaymentUpload({
        invoice: {
          ...pendingInvoice,
          reservation: { status: "accepted" },
        },
        profile: admin,
      }),
    ).toEqual({
      ok: false,
      message: "Esta reserva ya no admite un comprobante",
    });
  });

  it("lets an admin replace a voucher after the reservation is accepted", () => {
    expect(
      resolveReservationPaymentUpload({
        invoice: {
          id: 9,
          userId: 8,
          status: "pending",
          reservation: { status: "accepted" },
        },
        profile: admin,
        adminPath: true,
      }),
    ).toEqual({ ok: true, invoiceId: 9 });
  });

  it("lets an admin upload even when the invoice is already paid", () => {
    expect(
      resolveReservationPaymentUpload({
        invoice: {
          id: 9,
          userId: 8,
          status: "paid",
          reservation: { status: "accepted" },
        },
        profile: admin,
        adminPath: true,
      }),
    ).toEqual({ ok: true, invoiceId: 9 });
  });

  it("does not let a participant spoof the admin upload path", () => {
    expect(
      resolveReservationPaymentUpload({
        invoice: pendingInvoice,
        profile: owner,
        adminPath: true,
      }),
    ).toEqual({ ok: false, message: "No autorizado" });
  });
});
