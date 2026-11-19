import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import VolunteerApplicationReceivedEmailTemplate from "@/app/emails/volunteer-application-received";

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    VolunteerApplicationReceivedEmailTemplate({
      firstName: "Camila",
      festivalName: "Glitter v11",
      shifts: [
        { when: "Vie 18 dic · 15:00–19:00", label: "Montaje" },
        {
          when: "Dom 20 dic · 17:30–21:30",
          label: "Festival + desmontaje de mesas (turno B)",
        },
      ],
      firstChoiceRole: "Fotografía y redes sociales",
      secondChoiceRole: "Orientación al público",
      closesOn: "30 de noviembre",
      festivalDetails:
        "19 y 20 de diciembre de 2026, Teatro CBA, Santa Cruz de la Sierra",
      induction: "sábado 5 de diciembre",
      ...overrides,
    } as Parameters<typeof VolunteerApplicationReceivedEmailTemplate>[0]),
  );
}

describe("VolunteerApplicationReceivedEmailTemplate", () => {
  it("says the same as the thank-you state and lists what was chosen", () => {
    const html = render();
    expect(html).toContain("Recibimos tu postulación");
    expect(html).toContain("Te contactaremos por WhatsApp.");
    expect(html).toContain("el 30 de noviembre");
    expect(html).toContain("<strong>Vie 18 dic · 15:00–19:00</strong>");
    expect(html).toContain("Fotografía y redes sociales");
    expect(html).toContain("Orientación al público");
    expect(html).toContain("sábado 5 de diciembre");
  });

  it("drops the festival line when the festival has no dates or venue", () => {
    expect(render({ festivalDetails: null })).not.toContain("Festival:");
  });

  it("never reads as an acceptance", () => {
    expect(render()).not.toMatch(/aceptad|confirmad|seleccionad|quedaste/i);
  });
});
