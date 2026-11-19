import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import VolunteerApplicationReceivedEmailTemplate from "@/app/emails/volunteer-application-received";

describe("VolunteerApplicationReceivedEmailTemplate", () => {
  const html = renderToStaticMarkup(
    VolunteerApplicationReceivedEmailTemplate({
      firstName: "Camila",
      festivalName: "Glitter 11va edición",
      shifts: [
        "Vie 18 dic, 15:00–19:00 — Montaje",
        "Dom 20 dic, 17:30–21:30 — Festival + desmontaje de mesas (turno B)",
      ],
      firstChoiceRole: "Orientación al público",
      secondChoiceRole: "Fotografía y redes sociales",
    }),
  );

  it("says the same as the thank-you state and lists what was chosen", () => {
    expect(html).toContain("Recibimos tu postulación, te contactaremos por");
    expect(html).toContain("Vie 18 dic, 15:00–19:00 — Montaje");
    expect(html).toContain("1ª opción: Orientación al público");
    expect(html).toContain("2ª opción: Fotografía y redes sociales");
  });

  it("never reads as an acceptance", () => {
    expect(html).not.toMatch(/aceptad|confirmad|seleccionad|quedaste/i);
  });
});
