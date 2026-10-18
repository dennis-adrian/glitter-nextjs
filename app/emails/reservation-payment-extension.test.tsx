import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReservationPaymentExtensionTemplate from "@/app/emails/reservation-payment-extension";

const OWNER = { id: 1, displayName: "Ana Ilustra" };
const PARTNER = { id: 2, displayName: "Carla Dibuja" };

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    ReservationPaymentExtensionTemplate({
      recipient: OWNER,
      owner: OWNER,
      isOwner: true,
      reservation: {
        id: 42,
        festivalId: 7,
        stand: { label: "B", standNumber: 48 },
        members: [
          {
            position: 0,
            releasedAt: null,
            stand: { label: "B", standNumber: 48 },
          },
        ],
        festival: { name: "Glitter ¡Feliz Cumple!" },
      },
      newDueDate: new Date("2026-10-07T22:00:00.000Z"),
      ...overrides,
    } as Parameters<typeof ReservationPaymentExtensionTemplate>[0]),
  );
}

describe("ReservationPaymentExtensionTemplate", () => {
  it("asks the payer to upload the voucher from their own cobro", () => {
    const html = render();

    expect(html).toContain("¡Hola Ana Ilustra!");
    expect(html).toContain("Recordá subir el comprobante");
    expect(html).toContain("Completar el pago");
    expect(html).toContain("/profiles/1/festivals/7/reservations/42/payments");
  });

  /**
   * The partner used to be greeted as the payer and sent to the payer's
   * payments page, which redirects anyone else away.
   */
  it("greets a partner by name and links them to a page they can open", () => {
    const html = render({ recipient: PARTNER, isOwner: false });

    expect(html).toContain("¡Hola Carla Dibuja!");
    expect(html).toContain("Ana Ilustra");
    expect(html).toContain("El cobro está a nombre de");
    expect(html).toContain("le corresponde subir el comprobante");
    expect(html).toContain("/profiles/2/festivals/7/reservations/42/payments");
    expect(html).not.toContain("/profiles/1/");
    // Uploading is the payer's to do.
    expect(html).not.toContain("Completar el pago");
  });

  it("keeps both versions in voseo", () => {
    for (const isOwner of [true, false]) {
      const html = render({
        isOwner,
        recipient: isOwner ? OWNER : PARTNER,
      }).toLowerCase();
      expect(html).not.toContain("tienes");
      expect(html).not.toContain("puedes");
    }
  });
});
