import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import SessionPriceTransition from "@/app/components/programs/session-price-transition";

afterEach(cleanup);

describe("SessionPriceTransition", () => {
  it("shows the public price changing to the discounted participant price", () => {
    render(<SessionPriceTransition price={60} previousPrice={75} />);

    expect(
      screen.getByLabelText("Antes Bs 75,00; ahora Bs 60,00"),
    ).toBeTruthy();
    expect(
      screen.getByText("Bs 75,00").classList.contains("line-through"),
    ).toBe(true);
    expect(screen.getByText("Bs 60,00")).toBeTruthy();
  });

  it("shows one price when there is no discount", () => {
    render(<SessionPriceTransition price={75} previousPrice={75} />);

    expect(screen.getByText("Bs 75,00")).toBeTruthy();
    expect(screen.queryByText("→")).toBeNull();
  });
});
