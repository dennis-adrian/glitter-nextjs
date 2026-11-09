import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import ConsoleDetailPanel from "@/app/components/reservations/console-detail-panel";
import type { FeatureCreditAction } from "@/app/lib/payments/feature-credits";
import type {
  ConsoleEvent,
  ReservationConsoleDetail,
} from "@/app/lib/reservations/console-detail";

function event(overrides: Partial<ConsoleEvent>): ConsoleEvent {
  return {
    id: 1,
    eventType: "status_changed",
    fromStatus: null,
    toStatus: null,
    payload: null,
    createdAt: new Date("2026-09-20T15:00:00Z"),
    actor: "Admin Glitter",
    ...overrides,
  };
}

function render(events: ConsoleEvent[]) {
  const detail: ReservationConsoleDetail = {
    allocations: [],
    featureCredits: [],
    submissions: [],
    events,
  };
  return renderToStaticMarkup(<ConsoleDetailPanel detail={detail} />);
}

describe("ConsoleDetailPanel history", () => {
  /**
   * The Historial panel is Spanish; the enum is not. An upgrade that reopens
   * a paid reservation read "accepted → pending" to the admin explaining it.
   */
  it("names both sides of a transition in Spanish", () => {
    const html = render([
      event({ fromStatus: "accepted", toStatus: "pending" }),
      event({
        id: 2,
        eventType: "accepted",
        fromStatus: "verification_payment",
        toStatus: "accepted",
      }),
    ]);

    expect(html).toContain("Confirmada → Pendiente");
    expect(html).toContain("Verificación de Pago → Confirmada");
    expect(html).not.toContain("accepted →");
    expect(html).not.toContain("→ pending");
  });

  it("shows a status it has no label for as it is", () => {
    const html = render([
      event({ fromStatus: "pending", toStatus: "archived" }),
    ]);

    expect(html).toContain("Pendiente → archived");
  });

  it("shows no transition when the status did not change", () => {
    const html = render([
      event({ fromStatus: "accepted", toStatus: "accepted" }),
    ]);

    expect(html).not.toContain("→");
  });

  it("breaks a late partner's credits into the difference and the fee", () => {
    const html = render([
      event({
        fromStatus: "accepted",
        toStatus: "accepted",
        payload: {
          action: "late_partner_added",
          sharedPriceDifference: 300,
          featurePrice: 25,
          totalCredits: 325,
          fullTable: false,
        },
      }),
    ]);

    expect(html).toContain(
      "Agregó un compañero: Bs325 en créditos (Bs300 de diferencia + Bs25 de la función)",
    );
  });

  /** A full table pays the fee alone, so there is no difference to name. */
  it("says a full table's late partner paid the fee alone", () => {
    const html = render([
      event({
        fromStatus: "accepted",
        toStatus: "accepted",
        payload: {
          action: "late_partner_added",
          sharedPriceDifference: 0,
          featurePrice: 25,
          totalCredits: 25,
          fullTable: true,
        },
      }),
    ]);

    expect(html).toContain(
      "Agregó un compañero a la mesa completa: Bs25 en créditos, solo el costo de la función",
    );
    expect(html).not.toContain("de diferencia");
  });
});

describe("ConsoleDetailPanel feature credits", () => {
  function renderCredits(featureCredits: FeatureCreditAction[]) {
    const detail: ReservationConsoleDetail = {
      allocations: [],
      featureCredits,
      submissions: [],
      events: [],
    };
    return renderToStaticMarkup(<ConsoleDetailPanel detail={detail} />);
  }

  function lateCredit(
    items: FeatureCreditAction["items"],
    amount: number,
  ): FeatureCreditAction {
    return {
      actionId: 7,
      type: "late_partner",
      status: "fulfilled",
      amount,
      reversed: false,
      createdAt: new Date("2026-09-20T15:00:00Z"),
      items,
    };
  }

  /**
   * A full table's late partner stores its price difference at Bs0, because
   * the table costs the same for one or two. The line charged nothing, so it
   * explains nothing.
   */
  it("leaves out a component that charged nothing", () => {
    const html = renderCredits([
      lateCredit(
        [
          { kind: "shared_price_difference", amount: 0, description: null },
          { kind: "feature_access", amount: 25, description: null },
        ],
        25,
      ),
    ]);

    expect(html).toContain("Créditos gastados en la reserva");
    expect(html).toContain("Función: Bs25");
    expect(html).not.toContain("Diferencia individual → compartido");
  });

  it("still breaks a half table's late partner into both components", () => {
    const html = renderCredits([
      lateCredit(
        [
          { kind: "shared_price_difference", amount: 300, description: null },
          { kind: "feature_access", amount: 25, description: null },
        ],
        325,
      ),
    ]);

    expect(html).toContain("Diferencia individual → compartido: Bs300");
    expect(html).toContain("Función: Bs25");
  });
});
