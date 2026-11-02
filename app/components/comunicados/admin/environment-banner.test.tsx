// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ComunicadosEnvironmentBanner from "@/app/components/comunicados/admin/environment-banner";

describe("ComunicadosEnvironmentBanner", () => {
  afterEach(cleanup);

  it("warns on a preview that people picked by name get real email", () => {
    render(<ComunicadosEnvironmentBanner environment="preview" />);
    expect(
      screen.getByText(/Estás en un entorno de prueba: .*con un correo real/),
    ).toBeTruthy();
  });

  it("says development sends no email", () => {
    render(<ComunicadosEnvironmentBanner environment="development" />);
    expect(
      screen.getByText(/^Estás en desarrollo: .*no se envían correos\.$/),
    ).toBeTruthy();
  });

  it("says nothing in production", () => {
    const { container } = render(
      <ComunicadosEnvironmentBanner environment="production" />,
    );
    expect(container.textContent).toBe("");
  });
});
