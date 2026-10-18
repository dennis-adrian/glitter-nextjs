import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ProfileReviewRequestEmailTemplate from "@/app/emails/profile-review-request";

const profile = {
  id: 7,
  displayName: "Ana Ilustra",
  firstName: null,
  lastName: null,
  email: "ana@example.com",
};

function render(previousReason: string | null) {
  return renderToStaticMarkup(
    ProfileReviewRequestEmailTemplate({
      profile,
      previousReason,
    } as Parameters<typeof ProfileReviewRequestEmailTemplate>[0]),
  );
}

describe("ProfileReviewRequestEmailTemplate", () => {
  it("is titled as a review request", () => {
    expect(render(null)).toContain(
      "<strong>Solicitud de nueva revisión</strong>",
    );
  });

  it("names the participant who asked", () => {
    expect(render(null)).toContain(
      "Ana Ilustra</strong> pidió que volvamos a revisar su perfil",
    );
  });

  it("links admins to the profile", () => {
    expect(render(null)).toContain("/dashboard/users/7");
  });

  it("repeats the previous rejection reason when there is one", () => {
    const html = render("Faltan publicaciones en Instagram");

    expect(html).toContain("Motivo del rechazo anterior");
    expect(html).toContain("Faltan publicaciones en Instagram");
  });

  it("keeps the line breaks the admin typed in the previous reason", () => {
    const html = render("Línea uno\nLínea dos");

    expect(html).toContain("white-space:pre-line");
    expect(html).toContain("Línea uno");
    expect(html).toContain("Línea dos");
  });

  it("leaves the reason block out when none was recorded", () => {
    expect(render(null)).not.toContain("Motivo del rechazo anterior");
  });
});
