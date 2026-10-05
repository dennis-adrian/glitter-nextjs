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

function render() {
  return renderToStaticMarkup(
    ProfileRejectionEmailTemplate({
      profile,
      reason: "El perfil de Instagram que agregaste no tiene publicaciones",
    } as Parameters<typeof ProfileRejectionEmailTemplate>[0]),
  );
}

describe("ProfileRejectionEmailTemplate", () => {
  it("gives the reason the admin recorded", () => {
    expect(render()).toContain(
      "El perfil de Instagram que agregaste no tiene publicaciones",
    );
  });

  it("links to the profile so they can correct it", () => {
    const html = render();

    expect(html).toContain("/my_profile");
    expect(html).toContain("Corregir mi perfil");
  });

  /**
   * Saving a profile that was already complete does not notify admins, so the
   * participant has to ask for the new review themselves.
   */
  it("says how to get a new review", () => {
    const html = render();

    expect(html).toContain("Corregí tus datos desde tu perfil");
    expect(html).toContain("soporte@productoraglitter.com");
    expect(html).toContain("volvamos a revisar");
  });

  it("speaks in voseo", () => {
    const html = render();

    expect(html).toContain("necesitás");
    expect(html).not.toContain("necesitas");
  });
});
