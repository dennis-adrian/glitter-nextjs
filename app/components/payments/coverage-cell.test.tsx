import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import CoverageCell from "@/app/components/payments/coverage-cell";
import { computeInvoiceTender } from "@/app/lib/payments/tender";

afterEach(cleanup);

/** Invoice 1837 of festival 490: Bs370, Bs20 in credits, a Bs350 voucher waiting. */
const partiallyCredited = computeInvoiceTender({
  amount: 370,
  allocations: [{ amount: 20, reversed: false }],
  payments: [{ id: 7, amount: 350 }],
  submissions: [{ paymentId: 7, status: "submitted" }],
});

/** Invoice 1822: the same shape after the voucher was approved. */
const settled = computeInvoiceTender({
  amount: 400,
  allocations: [{ amount: 20, reversed: false }],
  payments: [{ id: 8, amount: 380 }],
  submissions: [{ paymentId: 8, status: "approved" }],
});

describe("CoverageCell", () => {
  it("names both tenders instead of only the invoice total", () => {
    render(<CoverageCell state="under_review" tender={partiallyCredited} />);

    // The whole point: Bs370 beside a voucher used to be all an admin saw.
    expect(screen.getByText("Bs370")).toBeDefined();
    expect(
      screen.getByText("Bs20 créditos · Bs350 QR en revisión"),
    ).toBeDefined();
    expect(screen.getByText("En revisión")).toBeDefined();
  });

  it("keeps an unreviewed voucher out of the covered figure", () => {
    render(<CoverageCell state="under_review" tender={partiallyCredited} />);

    expect(screen.getByLabelText("Bs20 de Bs370 cubierto")).toBeDefined();
  });

  it("shows approved cash as covered once its submission is approved", () => {
    render(<CoverageCell state="paid" tender={settled} />);

    expect(screen.getByText("Bs20 créditos · Bs380 QR")).toBeDefined();
    expect(screen.getByLabelText("Bs400 de Bs400 cubierto")).toBeDefined();
  });

  it("names the passed deadline on an overdue invoice", () => {
    const untouched = computeInvoiceTender({
      amount: 150,
      allocations: [],
      payments: [],
      submissions: [],
    });

    render(
      <CoverageCell
        state="overdue"
        tender={untouched}
        dueAt={new Date("2026-09-03T18:00:00Z")}
      />,
    );

    expect(screen.getByText(/Venció el/)).toBeDefined();
  });

  it("renders only the badge when compact", () => {
    render(<CoverageCell state="partial" tender={partiallyCredited} compact />);

    expect(screen.getByText("Parcial")).toBeDefined();
    expect(screen.queryByText("Bs370")).toBeNull();
  });
});
