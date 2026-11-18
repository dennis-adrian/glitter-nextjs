import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EmailChangedOldAddressEmail from "@/app/emails/email-changed-old-address";

function render(name: string | null = "Ana Ilustra") {
  return renderToStaticMarkup(
    EmailChangedOldAddressEmail({ name, newEmail: "camila.rojas@gmail.com" }),
  );
}

describe("EmailChangedOldAddressEmail", () => {
  it("says the sign-in address changed", () => {
    expect(render()).toContain(
      "Cambiamos el correo de acceso de tu cuenta Glitter",
    );
  });

  /**
   * This mailbox may belong to someone other than the person who asked for
   * the change, so it never learns the full new address.
   */
  it("shows the new address masked, never in full", () => {
    const html = render();

    expect(html).toContain("ca••••@gmail.com");
    expect(html).not.toContain("camila.rojas");
  });

  /**
   * The old address can still be on the account for a moment, and sessions
   * already open stay open, so the notice does not promise otherwise.
   */
  it("says this mailbox stops getting our notices, not that it cannot sign in", () => {
    const html = render();

    expect(html).toContain("este correo deja de recibir nuestros avisos");
    expect(html).not.toContain("ya no sirve");
    expect(html).not.toMatch(/no (vas a poder|podés|puede) (entrar|ingresar)/);
  });

  it("says where to write if they did not ask for it", () => {
    const html = render();

    expect(html).toContain("Si no pediste este cambio");
    expect(html).toContain("soporte@productoraglitter.com");
  });

  it("greets by name, or without one", () => {
    expect(render()).toContain("¡Hola Ana Ilustra!");
    expect(render(null)).toContain("¡Hola!");
    expect(render("  ")).toContain("¡Hola!");
  });

  it("speaks in voseo", () => {
    const html = render();

    expect(html).toContain("ingresás");
    expect(html).toContain("escribinos");
    expect(html).not.toContain("escríbenos");
  });
});
