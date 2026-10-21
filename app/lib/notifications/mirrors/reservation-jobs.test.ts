import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildParticipationJobNotification,
  buildReservationJobNotification,
  buildTopUpRejectedJobNotification,
  type ReservationContext,
  type ReservationJobToMirror,
} from "@/app/lib/notifications/mirrors/reservation-jobs";
import {
  buildInAppCopy,
  notificationCategory,
  notificationCreditDelta,
  notificationOpensDetail,
} from "@/app/lib/notifications/registry";

const OWNER = 10;
const PARTNER = 11;
const ADMIN = 99;

const context: ReservationContext = {
  reservationId: 7,
  festivalId: 3,
  festivalName: "Glitter Vol. 9",
  ownerUserId: OWNER,
  payerUserId: OWNER,
  standLabel: "B48",
  members: [
    { standId: 49, position: 1, releasedAt: null, label: "B49" },
    { standId: 48, position: 0, releasedAt: null, label: "B48" },
  ].sort((a, b) => a.position - b.position),
  names: new Map([
    [OWNER, "Ana Pérez"],
    [PARTNER, "Bruno"],
  ]),
};

function job(
  overrides: Partial<ReservationJobToMirror>,
): ReservationJobToMirror {
  return {
    jobId: 501,
    kind: "proof_submitted",
    reservationId: 7,
    userId: OWNER,
    payload: { reservationId: 7 },
    audience: "participant",
    ...overrides,
  };
}

/** Builds the item and renders its copy, as `notify()` would store it. */
function render(built: ReturnType<typeof buildReservationJobNotification>) {
  if (!built) throw new Error("expected an inbox item");
  return {
    kind: built.kind,
    category: notificationCategory(built.kind),
    copy: buildInAppCopy(built.kind, built.data as never),
    delta: notificationCreditDelta(built.kind, built.data),
    opensDetail: notificationOpensDetail(built.kind, built.data),
  };
}

describe("buildReservationJobNotification", () => {
  it("tells the payer their voucher arrived, linking to their own payments page", () => {
    const item = render(buildReservationJobNotification(job({}), context));
    expect(item.kind).toBe("reservation_proof_submitted");
    expect(item.category).toBe("credits");
    expect(item.copy.title).toBe("Recibimos tu comprobante de pago");
    expect(item.copy.body).toContain("los espacios B48 y B49");
    expect(item.copy.body).toContain("Glitter Vol. 9");
    expect(item.copy.actionPath).toBe(
      "/profiles/10/festivals/3/reservations/7/payments",
    );
    expect(item.opensDetail).toBe(false);
  });

  it("files the admin copy under Administración with the participant's name", () => {
    const item = render(
      buildReservationJobNotification(
        job({ userId: ADMIN, audience: "admin" }),
        context,
      ),
    );
    expect(item.kind).toBe("reservation_proof_submitted_admin");
    expect(item.category).toBe("admin");
    expect(item.copy.title).toBe("Ana Pérez subió el comprobante de su reserva");
    expect(item.copy.actionPath).toBe(
      "/dashboard/festivals/3/reservations?lens=cobros&reservation=7",
    );
  });

  it("only mirrors reservation_created for admins", () => {
    expect(
      buildReservationJobNotification(
        job({ kind: "reservation_created" }),
        context,
      ),
    ).toBeNull();
    const item = render(
      buildReservationJobNotification(
        job({ kind: "reservation_created", userId: ADMIN, audience: "admin" }),
        context,
      ),
    );
    expect(item.kind).toBe("reservation_created_admin");
    expect(item.copy.actionPath).toBe("/dashboard/reservations/7/edit");
  });

  it("confirms the reservation to the payer and tells admins it was credits", () => {
    expect(
      render(
        buildReservationJobNotification(
          job({ kind: "settlement_approved" }),
          context,
        ),
      ),
    ).toMatchObject({
      kind: "reservation_confirmed",
      category: "reservations",
      copy: { actionPath: "/profiles/10/festivals/3/reservations/7" },
    });
    expect(
      render(
        buildReservationJobNotification(
          job({
            kind: "settlement_approved",
            userId: ADMIN,
            audience: "admin",
          }),
          context,
        ),
      ),
    ).toMatchObject({
      kind: "reservation_confirmed_with_credits_admin",
      copy: {
        actionPath:
          "/dashboard/festivals/3/reservations?lens=creditos&reservation=7",
      },
    });
  });

  it("skips settlement_rejected, whose email is never sent for a pending reservation", () => {
    expect(
      buildReservationJobNotification(
        job({ kind: "settlement_rejected" }),
        context,
      ),
    ).toBeNull();
  });

  it("puts a cancellation reason in its own paragraph and opens the item's page", () => {
    const item = render(
      buildReservationJobNotification(
        job({
          kind: "reservation_rejected",
          userId: PARTNER,
          payload: { reservationId: 7, reason: "  Pago duplicado  " },
        }),
        context,
      ),
    );
    expect(item.kind).toBe("reservation_cancelled");
    expect(item.copy.body).toMatch(/\n\nMotivo: Pago duplicado$/);
    expect(item.copy.actionPath).toBe(
      "/profiles/11/festivals/3/reservations/7",
    );
    expect(item.opensDetail).toBe(true);

    const withoutReason = render(
      buildReservationJobNotification(
        job({ kind: "reservation_rejected", payload: { reservationId: 7 } }),
        context,
      ),
    );
    expect(withoutReason.copy.body).not.toContain("Motivo");
    expect(withoutReason.opensDetail).toBe(false);
  });

  it("tells owner and partner apart on a deadline extension", () => {
    const dueAt = "2026-11-05T22:00:00.000Z";
    const owner = render(
      buildReservationJobNotification(
        job({ kind: "deadline_extended", payload: { dueAt } }),
        context,
      ),
    );
    expect(owner.kind).toBe("reservation_payment_deadline_extended");
    expect(owner.copy.title).toBe("Se extendió el plazo de pago de tu reserva");
    expect(owner.copy.actionLabel).toBe("Completar el pago");
    // Bolivia time: 22:00 UTC is 6:00 PM in La Paz.
    expect(owner.copy.body).toContain("6:00 PM");

    const partner = render(
      buildReservationJobNotification(
        job({ kind: "deadline_extended", userId: PARTNER, payload: { dueAt } }),
        context,
      ),
    );
    expect(partner.copy.title).toBe(
      "Se extendió el plazo de pago de la reserva que compartís",
    );
    expect(partner.copy.body).toContain("Ana Pérez");
    expect(partner.copy.actionPath).toBe(
      "/profiles/11/festivals/3/reservations/7/payments",
    );
  });

  it("drops a deadline job whose date cannot be read rather than inventing one", () => {
    expect(
      buildReservationJobNotification(
        job({ kind: "deadline_extended", payload: { dueAt: "mañana" } }),
        context,
      ),
    ).toBeNull();
  });

  it("names what a release freed and keeps the owner's spend out of the partner's copy", () => {
    const retired = new Date("2026-10-20T12:00:00Z");
    const released: ReservationContext = {
      ...context,
      members: context.members.map((member) => ({
        ...member,
        releasedAt: retired,
      })),
    };
    const payload = { creditPrice: 15, releasedStandIds: [48, 49] };
    const owner = render(
      buildReservationJobNotification(
        job({ kind: "reservation_released", payload }),
        released,
      ),
    );
    expect(owner.copy.title).toBe("Liberaste tu reserva");
    expect(owner.copy.body).toContain("de los espacios B48 y B49");
    expect(owner.copy.body).toContain("15 créditos");
    expect(owner.delta).toBe(-15);
    expect(owner.copy.actionPath).toBe(
      "/profiles/10/festivals/3/reservations/new",
    );

    const partner = render(
      buildReservationJobNotification(
        job({ kind: "reservation_released", userId: PARTNER, payload }),
        released,
      ),
    );
    expect(partner.copy.title).toBe("Se liberó la reserva que compartías");
    expect(partner.copy.body).toContain("Ana Pérez liberó");
    expect(partner.copy.body).not.toContain("crédito");
    expect(partner.delta).toBeNull();
  });

  it("tells the owner who they added and the partner that they owe nothing", () => {
    const payload = { partnerUserId: PARTNER, totalCredits: 12.5 };
    const owner = render(
      buildReservationJobNotification(
        job({ kind: "late_partner_added", payload }),
        context,
      ),
    );
    expect(owner.copy.title).toBe("Agregaste a Bruno a tu reserva");
    expect(owner.copy.body).toContain("12.50 créditos");
    expect(owner.delta).toBe(-12.5);

    const partner = render(
      buildReservationJobNotification(
        job({ kind: "late_partner_added", userId: PARTNER, payload }),
        context,
      ),
    );
    expect(partner.copy.title).toBe("Vas a compartir un espacio en Glitter Vol. 9");
    expect(partner.copy.body).toContain("No tenés que pagar nada");
    expect(partner.copy.body).not.toContain("12.50");
    expect(partner.delta).toBeNull();
  });

  it("falls back to the parent stand when no member is loaded", () => {
    const item = render(
      buildReservationJobNotification(job({}), { ...context, members: [] }),
    );
    expect(item.copy.body).toContain("el espacio B48 ");
  });
});

describe("buildParticipationJobNotification", () => {
  const festival = {
    id: 3,
    name: "Glitter Vol. 9",
    reservationsStartDate: new Date("2026-11-01T14:00:00Z"),
  };

  it("freezes whether reservations were open when the item was written", () => {
    const before = render(
      buildParticipationJobNotification(
        job({ kind: "festival_participation_approved", reservationId: null }),
        festival,
        new Date("2026-10-21T12:00:00Z"),
      ),
    );
    expect(before.copy.title).toBe(
      "Tu postulación para Glitter Vol. 9 fue aprobada",
    );
    expect(before.copy.body).toContain("Vas a poder reservar tu espacio");
    expect(before.copy.actionPath).toBe("/festivals/3/terms");

    const after = render(
      buildParticipationJobNotification(
        job({ kind: "festival_participation_approved", reservationId: null }),
        festival,
        new Date("2026-11-02T12:00:00Z"),
      ),
    );
    expect(after.copy.body).toBe(
      "Ya podés continuar con la reserva de tu espacio.",
    );
  });

  it("opens a rejection's own page, with the reason when there is one", () => {
    const item = render(
      buildParticipationJobNotification(
        job({
          kind: "festival_participation_rejected",
          reservationId: null,
          payload: { festivalId: 3, reason: "Cupo completo" },
        }),
        festival,
        new Date(),
      ),
    );
    expect(item.copy.actionPath).toBeNull();
    expect(item.copy.body).toContain("El motivo que registramos es: Cupo completo");
    expect(item.opensDetail).toBe(true);
  });
});

describe("buildTopUpRejectedJobNotification", () => {
  it("reports the voucher's credits taken back and any balance owed", () => {
    const item = render(
      buildTopUpRejectedJobNotification(
        job({
          kind: "credit_top_up_rejected",
          reservationId: null,
          payload: { topUpId: 4, debtAmount: 8 },
        }),
        { id: 4, amount: 20, rejectionReason: "El comprobante no es legible" },
      ),
    );
    expect(item.kind).toBe("credit_top_up_rejected");
    expect(item.category).toBe("credits");
    expect(item.copy.body).toContain("20 créditos");
    expect(item.copy.body).toContain("saldo pendiente de 8 créditos");
    expect(item.copy.body).toMatch(/Motivo: El comprobante no es legible$/);
    expect(item.delta).toBe(-20);
    expect(item.opensDetail).toBe(true);
    expect(item.copy.actionPath).toBe("/my_credits");
  });

  it("says nothing about debt when nothing is owed", () => {
    const item = render(
      buildTopUpRejectedJobNotification(
        job({
          kind: "credit_top_up_rejected",
          reservationId: null,
          payload: { topUpId: 4, debtAmount: 0 },
        }),
        { id: 4, amount: 20, rejectionReason: null },
      ),
    );
    expect(item.copy.body).not.toContain("pendiente");
    expect(item.copy.body).toContain("Motivo: No se indicó un motivo.");
  });
});
