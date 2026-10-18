import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import MyPurchaseCard from "@/app/components/programs/my-purchase-card";
import type { PurchaseForAccess } from "@/app/lib/programs/purchase-queries";

afterEach(cleanup);

const STARTS_AT = new Date("2099-10-01T14:00:00.000Z");
const ENDS_AT = new Date("2099-10-01T16:00:00.000Z");

/**
 * Only the fields the card reads. The full row type drags in every column of
 * five tables, none of which change what renders here.
 */
function purchase(
  program: { name: string; status: "published" } | null,
): PurchaseForAccess {
  return {
    id: 7,
    status: "approved",
    program,
    promoRedemption: null,
    vouchers: [],
    lines: [
      {
        id: 1,
        session: {
          title: "Taller de risografía",
          type: "workshop",
          status: "published",
        },
        occurrence: {
          startsAt: STARTS_AT,
          endsAt: ENDS_AT,
          lifecycleStatus: "scheduled",
          salesStartAt: null,
          salesEndAt: null,
          salesClosedAt: null,
          rescheduledAt: null,
          venue: null,
        },
        ticket: { status: "valid" },
      },
    ],
  } as unknown as PurchaseForAccess;
}

describe("MyPurchaseCard", () => {
  it("names the program under the session title", () => {
    render(
      <MyPurchaseCard
        purchase={purchase({ name: "Ciclo de impresión", status: "published" })}
      />,
    );

    expect(screen.getByText("Taller de risografía")).toBeTruthy();
    expect(screen.getByText("Ciclo de impresión")).toBeTruthy();
  });

  it("shows only the session title and type for a standalone session", () => {
    const { container } = render(<MyPurchaseCard purchase={purchase(null)} />);

    expect(screen.getByText("Taller de risografía")).toBeTruthy();
    expect(screen.getByText("Taller")).toBeTruthy();
    // Nothing stands in for the missing program name.
    expect(container.textContent).not.toMatch(/programa/i);
    expect(screen.getByRole("link", { name: "Ver entrada y QR" })).toBeTruthy();
  });
});
