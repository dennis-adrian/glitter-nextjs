import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ProfileRejectionEmailTemplate from "@/app/emails/profile-rejection";

const profile = {
  id: 7,
  displayName: "Ana Ilustra",
  firstName: null,
  lastName: null,
  email: "ana@example.com",
};

function render(
  reason = "El perfil de Instagram que agregaste no tiene publicaciones",
) {
  return renderToStaticMarkup(
    ProfileRejectionEmailTemplate({
      profile,
      reason,
    } as Parameters<typeof ProfileRejectionEmailTemplate>[0]),
  );
}

describe("ProfileRejectionEmailTemplate", () => {
  it("gives the reason the admin recorded", () => {
    expect(render()).toContain(
      "El perfil de Instagram que agregaste no tiene publicaciones",
    );
  });

  it("keeps the line breaks the admin typed in the reason", () => {
    const html = render("Línea uno\nLínea dos");

    expect(html).toContain("white-space:pre-line");
    expect(html).toContain("Línea uno");
    expect(html).toContain("Línea dos");
  });

  it("links to the profile so they can correct it", () => {
    const html = render();

    expect(html).toContain("/my_profile");
    expect(html).toContain("Corregir mi perfil");
  });

  /**
   * Saving a corrected profile does not notify admins: the participant asks
   * for the new review with the button on their profile.
   */
  it("says how to get a new review", () => {
    const html = render();

    expect(html).toContain("Corregí tus datos desde tu perfil");
    expect(html).toContain("Pedir una nueva revisión");
    expect(html).toContain("para avisarnos que ya está listo.");
    expect(html).not.toContain("para que lo volvamos a revisar");
  });

  it("keeps soporte as the contact for questions", () => {
    const html = render();

    expect(html).toContain("Si tenés alguna duda");
    expect(html).toContain("soporte@productoraglitter.com");
  });

  it("speaks in voseo", () => {
    const html = render();

    expect(html).toContain("necesitás");
    expect(html).not.toContain("necesitas");
  });
});
