// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ReservationPaymentSkeleton from "@/app/components/payments/reservation-payment-skeleton";

afterEach(cleanup);

describe("ReservationPaymentSkeleton", () => {
  it("shows the real step row and tells assistive tech the rest is loading", () => {
    render(<ReservationPaymentSkeleton />);
    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("Cargando");
    expect(screen.getByText("Paso 3 de 3")).toBeTruthy();
  });
});
