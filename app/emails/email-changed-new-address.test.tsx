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
   * The old Google account was unlinked. Signing in with it does not fail:
   * it quietly opens a brand new account, which looks like lost data.
   */
  it("says which Google account to use, and what the old one would do", () => {
    const html = render();

    expect(html).toContain(
      "Si antes entrabas con Google, usá la cuenta de Google de este",
    );
    expect(html).toContain("cuenta de Google anterior");
    expect(html).toContain("cuenta nueva y vacía");
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
