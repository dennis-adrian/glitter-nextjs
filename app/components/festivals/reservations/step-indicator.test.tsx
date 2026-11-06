// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import StepIndicator from "@/app/components/festivals/reservations/step-indicator";

afterEach(cleanup);

describe("StepIndicator", () => {
  it("steps aside under the installed app's top bar, and still renders for a browser tab", () => {
    const { container } = render(
      <StepIndicator
        step={2}
        totalSteps={3}
        backLabel="Volver al mapa"
        onBack={() => {}}
      />,
    );

    const root = container.firstElementChild;
    expect(root?.hasAttribute("data-installed-hidden")).toBe(true);
    expect(screen.getByText("Paso 2 de 3")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Volver al mapa" })).toBeTruthy();
  });
});
