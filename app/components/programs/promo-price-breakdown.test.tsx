import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PromoPriceBreakdown from "@/app/components/programs/promo-price-breakdown";

afterEach(cleanup);

describe("PromoPriceBreakdown", () => {
  it("uses the public price as the promo discount reference", () => {
    render(
      <PromoPriceBreakdown
        code="IMBLACKLEO"
        partnerName="Black Leo"
        discountPercent={50}
        baseAmount={75}
        discountAmount={38}
        totalAmount={37}
        higherPriceAccepted={false}
      />,
    );

    expect(screen.getByText("Precio público")).toBeTruthy();
    expect(screen.getByText("Bs 75,00")).toBeTruthy();
    expect(screen.getByText("−Bs 38,00")).toBeTruthy();
    expect(screen.queryByText("Bs 60,00")).toBeNull();
  });
});
