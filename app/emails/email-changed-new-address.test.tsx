import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import EmailChangedNewAddressEmail from "@/app/emails/email-changed-new-address";

function render(name: string | null = "Ana Ilustra") {
  return renderToStaticMarkup(
    EmailChangedNewAddressEmail({ name, newEmail: "camila.rojas@gmail.com" }),
  );
}

describe("EmailChangedNewAddressEmail", () => {
  it("says this is the address they sign in with now", () => {
    const html = render();

    expect(html).toContain("Desde ahora");
    expect(html).toContain("ingresás con");
    expect(html).toContain("camila.rojas@gmail.com");
  });

  /**
   * The template is not told whether a Google account was unlinked, so it
   * must not say one was, nor what signing in with it would do.
   */
  it("says which Google account to use, and claims nothing about the old one", () => {
    const html = render();

    expect(html).toContain(
      "Si entrás con Google, usá la cuenta de Google de este correo.",
    );
    expect(html).not.toContain("anterior");
    expect(html).not.toContain("Desvincul");
    expect(html).not.toContain("cuenta nueva");
  });

  it("links to the sign-in page", () => {
    const html = render();

    expect(html).toContain("/sign_in");
    expect(html).toContain("Ingresar a Glitter");
  });

  it("keeps soporte as the contact", () => {
    const html = render();

    expect(html).toContain("Si no pediste este cambio");
    expect(html).toContain("soporte@productoraglitter.com");
  });

  it("greets by name, or without one", () => {
    expect(render()).toContain("¡Hola Ana Ilustra!");
    expect(render(null)).toContain("¡Hola!");
  });

  it("speaks in voseo", () => {
    const html = render();

    expect(html).toContain("usá");
    expect(html).toContain("entrás");
    expect(html).not.toContain("entras con");
  });
});
