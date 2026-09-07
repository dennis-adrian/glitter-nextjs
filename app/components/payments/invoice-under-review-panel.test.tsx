import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/components/payments/complete-payment-button", () => ({
  default: () => <div>Reemplazar comprobante</div>,
}));

import InvoiceUnderReviewPanel from "@/app/components/payments/invoice-under-review-panel";

const baseInvoice = {
  id: 1,
  userId: 8,
  reservationId: 4,
  amount: 150,
  status: "verification_payment" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  payments: [
    {
      id: 10,
      invoiceId: 1,
      amount: 150,
      date: new Date(),
      voucherUrl: "https://files.example.com/voucher.pdf",
      fileKey: "uploadthing-key",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
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
};

describe("InvoiceUnderReviewPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the voucher link for the invoice owner by default", () => {
    render(<InvoiceUnderReviewPanel invoice={baseInvoice} />);
    const link = screen.getByRole("link", { name: "Ver el comprobante enviado" });
    expect(link.getAttribute("href")).toBe("https://files.example.com/voucher.pdf");
  });

  it("links to the latest payment voucher even when payments are unordered", () => {
    const older = {
      ...baseInvoice.payments[0],
      id: 10,
      voucherUrl: "https://files.example.com/old.pdf",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const newer = {
      ...baseInvoice.payments[0],
      id: 11,
      voucherUrl: "https://files.example.com/new.pdf",
      createdAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    const newestWithoutVoucher = {
      ...baseInvoice.payments[0],
      id: 12,
      voucherUrl: "",
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    };

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
