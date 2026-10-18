import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import VerificationConfirmationEmailTemplate from "@/app/emails/verification_confimation/email-template";

const festival = {
  id: 12,
  name: "Glitter ¡Feliz Cumple!",
  reservationsStartDate: new Date("2026-10-10T02:00:00.000Z"),
  festivalDates: [
    {
      id: 1,
      startDate: new Date("2026-11-14T18:00:00.000Z"),
      endDate: new Date("2026-11-14T23:00:00.000Z"),
    },
  ],
};

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    VerificationConfirmationEmailTemplate({
      name: "Ana Ilustra",
      category: "illustration",
      festival,
      isFestivalFull: false,
      ...overrides,
    } as Parameters<typeof VerificationConfirmationEmailTemplate>[0]),
  );
}

describe("VerificationConfirmationEmailTemplate", () => {
  it("congratulates in a full sentence", () => {
    expect(render({ festival: null })).toContain(
      "¡Felicidades! Tu cuenta ha sido verificada.",
    );
  });

  it("closes the terms sentence when reservations are coming", () => {
    expect(render()).toContain("botón lila a continuación.");
  });

  it("invites to the full festival in voseo, ending with the date", () => {
    const html = render({ isFestivalFull: true });

    expect(html).toContain(
      "Pero no te preocupés: cuando lancemos un nuevo evento con espacio para <strong>ilustradores</strong>, vas a ser de los primeros en recibir una notificación para hacer tu reserva.",
    );
    expect(html).toContain("conocer a todos los participantes");
    expect(html).toMatch(/visitarnos el [^<]+\./);
  });

  it("promises a notice for the next event when there is none, in voseo", () => {
    expect(render({ festival: null })).toContain(
      "Cuando lancemos un nuevo evento con espacio para <strong>ilustradores</strong>, vas a recibir una notificación para hacer tu reserva.",
    );
  });
});
