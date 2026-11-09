import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import MapLegend from "@/app/components/maps/map-legend";

afterEach(cleanup);

describe("MapLegend", () => {
  it("lists Reservado apart from Seleccionado and Ocupado, in order", () => {
    const { container } = render(<MapLegend />);

    const labels = Array.from(container.querySelectorAll("span")).map(
      (span) => span.textContent,
    );
    expect(labels).toEqual([
      "Disponible",
      "Seleccionado",
      "En espera",
      "Reservado",
      "Ocupado",
      "Externo",
      "No disponible",
    ]);
  });
});
