import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Button, buttonVariants } from "@/app/components/ui/button";

afterEach(cleanup);

describe("Button wrap", () => {
  it("keeps one line and a fixed height by default", () => {
    render(<Button size="sm">Guardar</Button>);
    const button = screen.getByRole("button");
    expect(button.className).toContain("whitespace-nowrap");
    expect(button.className).toContain("h-8");
  });

  it("lets a long label wrap and the button grow instead of overflowing", () => {
    render(
      <Button size="sm" wrap>
        Liberar 20 créditos de Festival Glitter ¡Calurosa Navidad!
      </Button>,
    );
    const classes = screen.getByRole("button").className.split(" ");
    expect(classes).toContain("whitespace-normal");
    expect(classes).not.toContain("whitespace-nowrap");
    expect(classes).toContain("h-auto");
    expect(classes).not.toContain("h-8");
    expect(classes).toContain("max-w-full");
    // The fixed height stays as the minimum, so short labels look the same.
    expect(classes).toContain("min-h-8");
  });

  it("is available to links styled as buttons", () => {
    const classes = buttonVariants({ wrap: true }).split(" ");
    expect(classes).toContain("whitespace-normal");
    expect(classes).toContain("min-h-10");
    expect(classes).not.toContain("h-10");
  });
});
