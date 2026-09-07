import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import LatePartnerAddedTemplate from "@/app/emails/late-partner-added";

const OWNER = { id: 1, displayName: "Ana Ilustra" };
const PARTNER = { id: 2, displayName: "Carla Dibuja" };

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    LatePartnerAddedTemplate({
      recipient: PARTNER,
      owner: OWNER,
      partner: PARTNER,
      isOwner: false,
      festivalId: 7,
      festivalName: "Glitter ¡Feliz Cumple!",
      standLabel: "B48",
      reservationId: 42,
      totalCredits: 55,
      ...overrides,
    } as Parameters<typeof LatePartnerAddedTemplate>[0]),
  );
}

describe("LatePartnerAddedTemplate", () => {
  /**
   * The partner did not ask for this — somebody put them on a stand. Their
   * first question is what it costs them, so the answer comes before they can
   * ask it.
   */
  it("tells the partner they owe nothing, and who added them", () => {
    const html = render();

    expect(html).toContain("Ana Ilustra");
    expect(html).toContain("No tenés que pagar nada");
    expect(html).toContain("B48");
    // The fee is the owner's; quoting it to a partner reads like a bill.
    expect(html).not.toContain("55 créditos");
  });

  it("confirms the debit to the owner", () => {
    const html = render({ recipient: OWNER, isOwner: true });

    expect(html).toContain("Carla Dibuja");
    expect(html).toContain("55 créditos");
  });

  /** Adding a partner never reopens the original invoice (PRD §8.4). */
  it("tells the owner their original invoice is untouched", () => {
    const html = render({ recipient: OWNER, isOwner: true });

    expect(html).toContain("factura original no cambia");
  });

  it("links both of them to the reservation, each under their own profile", () => {
    expect(render()).toContain("/profiles/2/festivals/7/reservations/42");
    expect(render({ recipient: OWNER, isOwner: true })).toContain(
      "/profiles/1/festivals/7/reservations/42",
    );
  });

  it("keeps penalty language out of both versions", () => {
    for (const isOwner of [true, false]) {
      const html = render({
        isOwner,
        recipient: isOwner ? OWNER : PARTNER,
      }).toLowerCase();
      expect(html).not.toContain("multa");
      expect(html).not.toContain("penalizaci");
      expect(html).not.toContain("sanci");
    }
  });
});
