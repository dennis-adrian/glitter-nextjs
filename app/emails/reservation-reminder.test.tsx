import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReservationReminderTemplate from "@/app/emails/reservation-reminder";

const task = {
  id: 3,
  profileId: 1,
  reservationId: 42,
  dueDate: new Date("2026-03-10T22:00:00Z"),
  profile: { id: 1, displayName: "Ana Ilustra" },
  reservation: {
    id: 42,
    festivalId: 7,
    festival: { name: "Glitter ¡Feliz Cumple!" },
    stand: { label: "B", standNumber: 48 },
    members: [
      { position: 0, releasedAt: null, stand: { label: "B", standNumber: 48 } },
    ],
  },
} as unknown as Parameters<typeof ReservationReminderTemplate>[0]["task"];

function render() {
  return renderToStaticMarkup(ReservationReminderTemplate({ task }));
}

describe("ReservationReminderTemplate", () => {
  /**
   * The reminder lands about a day before the payment deadline. Without a
   * link the owner has to find the payment page on their own, against the
   * clock.
   */
  it("links the owner to this reservation's payment page", () => {
    const html = render();

    expect(html).toContain("/profiles/1/festivals/7/reservations/42/payments");
    expect(html).toContain("Completar el pago");
  });

  it("names the stand and festival", () => {
    const html = render();

    expect(html).toContain("B48");
    expect(html).toContain("Glitter ¡Feliz Cumple!");
  });

  it("speaks in voseo throughout", () => {
    const html = render();

    expect(html).toContain("Recordá");
    expect(html).not.toContain("Recuerda");
    expect(html).not.toContain("no dudes");
  });
});
