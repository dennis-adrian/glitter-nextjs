// @vitest-environment jsdom
import { render, cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (p: Record<string, unknown>) => (
    <img {...(p as { src: string; alt: string })} />
  ),
}));

import { ProductDetails } from "@/app/components/payments/product-details";

function member(id: number, position: number, releasedAt: Date | null = null) {
  return {
    standId: id,
    position,
    releasedAt,
    stand: {
      id,
      label: "A",
      standNumber: id,
      standCategory: "illustration",
    } as never,
  };
}
const festival = { name: "Glitter" } as never;
const invoice = (members: ReturnType<typeof member>[]) =>
  ({
    amount: 200,
    reservation: {
      stand: { label: "A", standNumber: 1, standCategory: "illustration" },
      members,
    },
  }) as never;

/**
 * Chairs and credentials come with each stand, and a full table is two stands
 * even though it is one reservation — so both scale with the occupied member
 * count, not with the reservation.
 */
describe("reservation entitlements", () => {
  afterEach(cleanup);

  it("gives one stand 2 chairs and 2 credentials", () => {
    render(
      <ProductDetails festival={festival} invoice={invoice([member(1, 0)])} />,
    );
    expect(screen.getByText(/2 sillas/)).toBeTruthy();
    expect(screen.getByText(/2 credenciales/)).toBeTruthy();
  });

  it("gives a full table 4 chairs and 4 credentials", () => {
    render(
      <ProductDetails
        festival={festival}
        invoice={invoice([member(1, 0), member(2, 1)])}
      />,
    );
    expect(screen.getByText(/4 sillas/)).toBeTruthy();
    expect(screen.getByText(/4 credenciales/)).toBeTruthy();
  });

  it("drops back to one stand's worth after a downgrade", () => {
    render(
      <ProductDetails
        festival={festival}
        invoice={invoice([member(1, 0), member(2, 1, new Date())])}
      />,
    );
    expect(screen.getByText(/2 sillas/)).toBeTruthy();
    expect(screen.getByText(/2 credenciales/)).toBeTruthy();
  });
});
