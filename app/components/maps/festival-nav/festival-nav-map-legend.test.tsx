import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import FestivalNavMapLegend from "@/app/components/maps/festival-nav/festival-nav-map-legend";

afterEach(cleanup);

describe("FestivalNavMapLegend", () => {
  it("shows only marker activities configured for the festival", () => {
    const { container } = render(
      <FestivalNavMapLegend activityTypes={["stamp_passport"]} />,
    );

    expect(container.textContent).toContain("Ocupado");
    expect(container.textContent).toContain("Carrera de sellos");
    expect(container.textContent).toContain("Disponible");
    expect(container.textContent).not.toContain("En cuponera");
    expect(container.textContent).not.toContain("Cacería de stickers");
  });
});
