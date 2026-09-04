import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/payments/complete-payment-button", () => ({
  default: () => <div>Reemplazar comprobante</div>,
}));

import InvoiceUnderReviewPanel from "@/app/components/payments/invoice-under-review-panel";
import type { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";

/**
 * A stand-in, not a faithful row.
 *
 * This panel reads the payments' voucher URLs and the invoice status; the
 * nested stand and festival exist only because the type carries them. The cast
 * is deliberate and stops at this boundary — `payment()` below builds real
 * rows, so drift in the part the panel actually touches still fails the build.
 */
type InvoicePayment = InvoiceWithPaymentsAndStand["payments"][number];

/** A real payment row, so a column added later fails here rather than silently. */
function payment(overrides: Partial<InvoicePayment> = {}): InvoicePayment {
  return {
    id: 10,
    invoiceId: 1,
    amount: 150,
    date: new Date(),
    voucherUrl: "https://files.example.com/voucher.pdf",
    fileKey: "uploadthing-key",
    idempotencyKey: null,
    uploadedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const baseInvoice = {
  id: 1,
  userId: 8,
  reservationId: 4,
  amount: 150,
  status: "verification_payment" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  payments: [payment()],
  reservation: {
    id: 4,
    standId: 7,
    festivalId: 1,
    status: "verification_payment" as const,
    source: "user_reservation" as const,
    revealAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    stand: {
      id: 7,
      label: "A1",
      festivalSectorId: 1,
      festivalId: 1,
      status: "reserved" as const,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    festival: {
      id: 1,
      name: "Festival",
      createdAt: new Date(),
      updatedAt: new Date(),
      festivalDates: [],
    },
  },
} as unknown as InvoiceWithPaymentsAndStand;

describe("InvoiceUnderReviewPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the voucher link for the invoice owner by default", () => {
    render(<InvoiceUnderReviewPanel invoice={baseInvoice} />);
    const link = screen.getByRole("link", {
      name: "Ver el comprobante enviado",
    });
    expect(link.getAttribute("href")).toBe(
      "https://files.example.com/voucher.pdf",
    );
  });

  it("links to the latest payment voucher even when payments are unordered", () => {
    const older = payment({
      id: 10,
      voucherUrl: "https://files.example.com/old.pdf",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const newer = payment({
      id: 11,
      voucherUrl: "https://files.example.com/new.pdf",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    });
    const newestWithoutVoucher = payment({
      id: 12,
      voucherUrl: "",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    const { rerender } = render(
      <InvoiceUnderReviewPanel
        invoice={{ ...baseInvoice, payments: [older, newer] }}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Ver el comprobante enviado" })
        .getAttribute("href"),
    ).toBe("https://files.example.com/new.pdf");

    rerender(
      <InvoiceUnderReviewPanel
        invoice={{
          ...baseInvoice,
          payments: [newer, newestWithoutVoucher, older],
        }}
      />,
    );
    expect(
      screen
        .getByRole("link", { name: "Ver el comprobante enviado" })
        .getAttribute("href"),
    ).toBe("https://files.example.com/new.pdf");
  });

  it("hides the voucher link when showVoucher is false", () => {
    render(
      <InvoiceUnderReviewPanel
        invoice={baseInvoice}
        allowReplace={false}
        showVoucher={false}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "Ver el comprobante enviado" }),
    ).toBeNull();
    expect(screen.queryByText("Reemplazar comprobante")).toBeNull();
  });

  it("hides the voucher link when the latest payment proof was removed", () => {
    render(
      <InvoiceUnderReviewPanel
        invoice={{
          ...baseInvoice,
          payments: [
            {
              ...baseInvoice.payments[0],
              voucherUrl: "https://files.example.com/rejected.pdf",
              fileKey: null,
            },
          ],
        }}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "Ver el comprobante enviado" }),
    ).toBeNull();
  });
});
