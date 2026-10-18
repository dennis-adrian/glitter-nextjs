import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReservationConfirmationForAdminsEmailTemplate from "@/app/emails/reservation-confirmation-for-admins";

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    ReservationConfirmationForAdminsEmailTemplate({
      participant: { id: 1, displayName: "Ana Ilustra" },
      festivalId: 7,
      festivalName: "Glitter ¡Feliz Cumple!",
      standLabel: "B48",
      standCount: 1,
      reservationId: 42,
      ...overrides,
    } as Parameters<typeof ReservationConfirmationForAdminsEmailTemplate>[0]),
  );
}

describe("ReservationConfirmationForAdminsEmailTemplate", () => {
  it("tells the team who confirmed what, and that nothing awaits review", () => {
    const html = render();

    expect(html).toContain("Ana Ilustra");
    expect(html).toContain("B48");
    expect(html).toContain("Glitter ¡Feliz Cumple!");
    expect(html).toContain("créditos");
    expect(html).toContain("confirmada automáticamente");
    expect(html).toContain("el espacio");
  });

  /**
   * Admins used to receive the participant's own confirmation, greeting the
   * participant by name and inviting them to set up their stand.
   */
  it("speaks about the participant, not to them", () => {
    const html = render();

    expect(html).not.toContain("Tu reserva");
    expect(html).not.toContain("Te esperamos");
    expect(html).not.toContain("¡Hola");
  });

  it("links to the reservation in the credits lens of the console", () => {
    const html = render();

    // Asserted apart because React escapes the `&` between the params.
    expect(html).toContain("/dashboard/festivals/7/reservations?lens=creditos");
    expect(html).toContain("reservation=42");
  });

  it("names both halves of a full table", () => {
    const html = render({ standCount: 2, standLabel: "B48 y B49" });

    expect(html).toContain("los espacios");
    expect(html).toContain("B48 y B49");
  });
});
