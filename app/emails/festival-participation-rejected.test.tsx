import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import FestivalParticipationRejectedEmailTemplate from "@/app/emails/festival-participation-rejected";

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    FestivalParticipationRejectedEmailTemplate({
      profile: { id: 8, displayName: "Ana Ilustra" },
      festival: {
        id: 10,
        name: "Glitter ¡Feliz Cumple!",
        festivalType: "glitter",
      },
      ...overrides,
    } as Parameters<typeof FestivalParticipationRejectedEmailTemplate>[0]),
  );
}

describe("FestivalParticipationRejectedEmailTemplate", () => {
  it("shows the reason the admin recorded", () => {
    const html = render({ reason: "El cupo de ilustración está completo." });

    expect(html).toContain("El motivo que registramos es");
    expect(html).toContain("El cupo de ilustración está completo.");
  });

  it("keeps the line breaks the admin typed in the reason", () => {
    const html = render({ reason: "Línea uno\nLínea dos" });

    expect(html).toContain("white-space:pre-line");
    expect(html).toContain("Línea uno");
    expect(html).toContain("Línea dos");
  });

  it("leaves the reason block out when there is none", () => {
    const html = render();

    expect(html).not.toContain("El motivo");
    // The standout block's background, so an empty box would show up here.
    expect(html).not.toContain("#f2f3f3");
  });

  it("speaks in voseo", () => {
    for (const reason of [undefined, "cupo completo"]) {
      const html = render({ reason }).toLowerCase();
      expect(html).toContain("escribinos");
      expect(html).not.toContain("tienes");
      expect(html).not.toContain("comunícate");
    }
  });
});
