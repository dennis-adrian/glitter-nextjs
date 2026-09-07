import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ReservationReleasedTemplate from "@/app/emails/reservation-released";

const OWNER = { id: 1, displayName: "Ana Ilustra" };
const PARTNER = { id: 2, displayName: "Carla Dibuja" };

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    ReservationReleasedTemplate({
      recipient: OWNER,
      owner: OWNER,
      isOwner: true,
      festivalId: 7,
      festivalName: "Glitter ¡Feliz Cumple!",
      standLabel: "B48",
      standCount: 1,
      creditPrice: 40,
      ...overrides,
    } as Parameters<typeof ReservationReleasedTemplate>[0]),
  );
}

describe("ReservationReleasedTemplate", () => {
  it("confirms to the owner what they did and what it cost", () => {
    const html = render();

    expect(html).toContain("Liberaste tu reserva");
    expect(html).toContain("B48");
    expect(html).toContain("40 créditos");
    expect(html).toContain("no se devuelven");
  });

  /**
   * The owner chose this; a partner is finding out. Naming who released it is
   * the difference between news and a confusing receipt.
   */
  it("tells a partner who released it, and bills them for nothing", () => {
    const html = render({ recipient: PARTNER, isOwner: false });

    expect(html).toContain("Carla Dibuja");
    expect(html).toContain("Ana Ilustra");
    expect(html).toContain("compartían");
    // The fee is the owner's alone, so a partner is never shown a price.
    expect(html).not.toContain("40 créditos");
    expect(html).not.toContain("no se devuelven");
  });

  /**
   * Nobody is holding the stand: it went back on the map at the moment of
   * release and somebody else may already have it.
   */
  it("says the space is gone rather than waiting", () => {
    for (const isOwner of [true, false]) {
      const html = render({ isOwner, recipient: isOwner ? OWNER : PARTNER });
      expect(html).toContain("volvió");
      expect(html).toContain("otra persona puede");
      expect(html).toContain("nueva reserva");
    }
  });

  it("speaks of two spaces when a full table was released", () => {
    const html = render({ standLabel: "B48 y B49", standCount: 2 });

    expect(html).toContain("los espacios");
    expect(html).toContain("B48 y B49");
    expect(html).toContain("Esos espacios volvieron");
  });

  /** A release is a choice the participant made, never a sanction (PRD §3). */
  it("keeps penalty language out of both versions", () => {
    for (const isOwner of [true, false]) {
      const html = render({ isOwner }).toLowerCase();
      expect(html).not.toContain("multa");
      expect(html).not.toContain("penalizaci");
      expect(html).not.toContain("sanci");
    }
  });
});
