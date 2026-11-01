import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { safeActionPath } from "@/app/lib/notifications/definitions";
import {
  buildEmailCopy,
  buildInAppCopy,
  hasEmail,
  isSensitiveNotificationKind,
  NOTIFICATION_KINDS,
  type NotificationKind,
  notificationCategory,
  notificationCreditDelta,
  notificationOpensDetail,
  notificationPushes,
  notificationStartsRead,
  parseNotificationData,
} from "@/app/lib/notifications/registry";

const gift = {
  campaignId: 3,
  name: "Ana",
  amount: 20,
  title: "Un regalo para agradecerte",
  message: "¡Gracias por ser parte de Glitter, Ana!",
};

describe("notification registry", () => {
  it("writes a gift's inbox item from its snapshot", () => {
    expect(buildInAppCopy("credit_gift_received", gift)).toEqual({
      title: "Recibiste 20 créditos de regalo",
      body: "¡Gracias por ser parte de Glitter, Ana!",
      actionPath: "/my_credits",
      actionLabel: "Ver mi billetera",
    });
    expect(notificationCreditDelta("credit_gift_received", gift)).toBe(20);
  });

  it("renders the same snapshot as the email, signed by the team", () => {
    const copy = buildEmailCopy("credit_gift_received", gift);
    expect(copy).toMatchObject({
      from: "Productora Glitter <creditos@productoraglitter.com>",
      subject: "Recibiste 20 créditos de regalo",
    });
    const html = renderToStaticMarkup(copy!.react);
    expect(html).toContain("¡Hola Ana!");
    expect(html).toContain("Productora Glitter");
    expect(html).toContain("/my_credits");
  });

  it("spells out the debt when a revocation leaves the balance negative", () => {
    const revoked = { ...gift, debtAmount: 15 };
    const copy = buildInAppCopy("credit_gift_revoked", revoked);
    expect(copy.title).toBe("Ajustamos tu saldo de créditos");
    expect(copy.body).toContain("saldo pendiente de 15 créditos");
    expect(notificationCreditDelta("credit_gift_revoked", revoked)).toBe(-20);

    const neutral = buildInAppCopy("credit_gift_revoked", {
      ...revoked,
      debtAmount: 0,
    });
    expect(neutral.body).not.toContain("pendiente");
  });

  it("keeps the admin summary in-app and in Administración", () => {
    expect(notificationCategory("credit_gift_completed")).toBe("admin");
    expect(hasEmail("credit_gift_completed")).toBe(false);
    expect(
      buildInAppCopy("credit_gift_completed", {
        campaignId: 3,
        title: "Regalo",
        withdrawn: false,
        granted: 35,
        revoked: 0,
        skipped: 2,
        failed: 0,
        totalGranted: 700,
      }),
    ).toMatchObject({
      title: "Regalo enviado: «Regalo»",
      body: "35 acreditados, 2 omitidos. Total vigente: Bs700.00.",
      actionPath: "/dashboard/credits/gifts/3",
    });
  });

  it("says a gift taken back from everyone was withdrawn, not sent", () => {
    // Nobody holds it any more, so "Regalo enviado" with a total would mislead.
    expect(
      buildInAppCopy("credit_gift_completed", {
        campaignId: 3,
        title: "Regalo",
        withdrawn: true,
        granted: 0,
        revoked: 3,
        skipped: 7,
        failed: 0,
        totalGranted: 0,
      }),
    ).toMatchObject({
      title: "Regalo retirado: «Regalo»",
      body: "3 retirados, 7 omitidos o cancelados. Total vigente: Bs0.00.",
    });
  });

  it("refuses a snapshot it cannot read instead of mailing nonsense", () => {
    expect(buildEmailCopy("credit_gift_received", { amount: "20" })).toBeNull();
    expect(buildEmailCopy("unknown_kind", gift)).toBeNull();
    expect(buildEmailCopy("credit_gift_completed", gift)).toBeNull();
  });
});

const reservation = {
  reservationId: 7,
  festivalId: 3,
  festivalName: "Glitter Vol. 9",
  standLabel: "B48",
  standCount: 1,
};
const own = { ...reservation, profileId: 10 };
const infraction = {
  infractionId: 8,
  profileId: 10,
  typeLabel: "No Show",
  festivalName: null,
  note: null,
};
const sanction = {
  sanctionId: 5,
  profileId: 10,
  typeLabel: "Advertencia",
  scopeLabel: "Global",
  infractionLabels: ["No Show"],
  note: null,
  festivalName: null,
  festivalId: null,
  reservationEligibleAt: null,
};

/**
 * One snapshot per kind, as its writer stores it. A new kind cannot ship
 * without one: the map must name every kind.
 */
const FIXTURES = {
  credit_gift_received: gift,
  credit_gift_revoked: { ...gift, debtAmount: 0 },
  credit_gift_completed: {
    campaignId: 3,
    title: "Regalo",
    granted: 3,
    skipped: 0,
    failed: 0,
    totalGranted: 60,
  },
  reservation_proof_submitted: own,
  reservation_zero_value_review_requested: own,
  reservation_confirmed: { ...own, startsAt: null, locationLabel: null },
  reservation_cancelled: { ...own, reason: null },
  reservation_payment_deadline_extended: {
    ...own,
    role: "owner",
    ownerName: "Ana",
    ownerUserId: 10,
    dueAt: "2026-11-05T22:00:00.000Z",
  },
  reservation_released: {
    ...own,
    role: "owner",
    ownerName: "Ana",
    ownerUserId: 10,
    creditPrice: 10,
  },
  reservation_partner_added: {
    ...own,
    role: "partner",
    ownerName: "Ana",
    ownerUserId: 10,
    partnerName: "Bruno",
    partnerUserId: 11,
    totalCredits: null,
  },
  festival_participation_approved: {
    festivalId: 3,
    festivalName: "Glitter Vol. 9",
    reservationsStartDate: null,
    reservationsOpen: true,
  },
  festival_participation_rejected: {
    festivalId: 3,
    festivalName: "Glitter Vol. 9",
    reason: null,
  },
  credit_top_up_rejected: {
    topUpId: 4,
    amount: 20,
    reason: "Ilegible",
    debtAmount: 0,
  },
  reservation_created_admin: {
    ...reservation,
    participantName: "Ana",
    participantUserId: 10,
  },
  reservation_proof_submitted_admin: {
    ...reservation,
    participantName: "Ana",
    participantUserId: 10,
  },
  reservation_zero_value_review_requested_admin: {
    ...reservation,
    participantName: "Ana",
    participantUserId: 10,
  },
  reservation_confirmed_with_credits_admin: {
    ...reservation,
    participantName: "Ana",
    participantUserId: 10,
  },
  infraction_registered: infraction,
  infraction_edited: infraction,
  infraction_resolved: infraction,
  infraction_voided: { ...infraction, note: "Error de carga" },
  sanction_approved: sanction,
  sanction_edited: sanction,
  sanction_expired: sanction,
  sanction_revoked: { ...sanction, note: "Se aclaró" },
  sanction_reservation_access_enabled: {
    ...sanction,
    festivalId: 3,
    reservationEligibleAt: "2026-11-01T14:00:00.000Z",
  },
  comunicado: {
    comunicadoId: 7,
    revision: 1,
    title: "Cambio de horario de armado",
    excerpt: "El armado del sábado empieza a las 8:00 en lugar de las 9:00.",
    actionPath: "/my_participations",
    actionLabel: "Ver mi reserva",
  },
  comunicado_not_sent: {
    comunicadoId: 7,
    title: "Cambio de horario de armado",
    reason: "late",
    detail: null,
    scheduledAt: "2026-10-31T13:00:00.000Z",
    audienceCount: 312,
  },
} satisfies Record<NotificationKind, unknown>;

describe("every kind", () => {
  it.each(NOTIFICATION_KINDS)(
    "%s reads back its snapshot and renders",
    (kind) => {
      const data = parseNotificationData(kind, FIXTURES[kind]);
      expect(data).not.toBeNull();
      const copy = buildInAppCopy(kind, data as never);
      expect(copy.title.trim()).not.toBe("");
      expect(copy.body.trim()).not.toBe("");
      // A link is an app path or nothing, and comes with its label.
      expect(safeActionPath(copy.actionPath)).toBe(copy.actionPath);
      expect(copy.actionLabel == null).toBe(copy.actionPath == null);
    },
  );

  it("keeps the Administración kinds' links in the dashboard", () => {
    for (const kind of NOTIFICATION_KINDS) {
      if (notificationCategory(kind) !== "admin") continue;
      const copy = buildInAppCopy(kind, FIXTURES[kind] as never);
      expect(copy.actionPath, kind).toMatch(/^\/dashboard\//);
    }
  });

  it("sends no email for the phase 2 copies: their outbox still does", () => {
    const withEmail = NOTIFICATION_KINDS.filter((kind) => hasEmail(kind));
    expect(withEmail).toEqual(["credit_gift_received", "credit_gift_revoked"]);
  });

  it("marks only the disciplinary notices as sensitive", () => {
    const sensitive = NOTIFICATION_KINDS.filter(isSensitiveNotificationKind);
    expect(sensitive).toHaveLength(9);
    expect(
      sensitive.every((kind) => /^(infraction|sanction)_/.test(kind)),
    ).toBe(true);
  });

  it("pushes participant news and the admin copies that ask for action", () => {
    const pushing = NOTIFICATION_KINDS.filter((kind) =>
      notificationPushes(kind, FIXTURES[kind] as never),
    );
    const admin = pushing.filter(
      (kind) => notificationCategory(kind) === "admin",
    );
    expect(admin.sort()).toEqual([
      "reservation_proof_submitted_admin",
      "reservation_zero_value_review_requested_admin",
    ]);
    expect(
      NOTIFICATION_KINDS.filter(
        (kind) =>
          notificationCategory(kind) !== "admin" &&
          !notificationPushes(kind, FIXTURES[kind] as never),
      ),
      "every participant kind pushes unless it starts read or pushes per send",
    ).toEqual(
      NOTIFICATION_KINDS.filter(
        (kind) =>
          notificationCategory(kind) !== "admin" &&
          (notificationStartsRead(kind, FIXTURES[kind] as never) ||
            kind === "comunicado"),
      ),
    );
    // Every sensitive kind pushes, with the generic text.
    expect(
      NOTIFICATION_KINDS.filter(isSensitiveNotificationKind).every((kind) =>
        pushing.includes(kind),
      ),
    ).toBe(true);
  });

  it("keeps a revoked gift's title and the debt on the item's own page", () => {
    // The push then says only "Tocá para ver el detalle." under its title.
    expect(
      notificationOpensDetail(
        "credit_gift_revoked",
        FIXTURES.credit_gift_revoked,
      ),
    ).toBe(true);
  });

  it("pushes a comunicado only when its sender asked", () => {
    const data = FIXTURES.comunicado as never;
    expect(notificationPushes("comunicado", data)).toBe(false);
    expect(notificationPushes("comunicado", data, { push: false })).toBe(false);
    expect(notificationPushes("comunicado", data, { push: true })).toBe(true);
    // The option is the sender's tick: it never makes another kind push.
    expect(
      notificationPushes(
        "credit_gift_completed",
        FIXTURES.credit_gift_completed as never,
        { push: true },
      ),
    ).toBe(false);
  });

  it("opens a comunicado on its own page and words a missed schedule", () => {
    expect(notificationOpensDetail("comunicado", FIXTURES.comunicado)).toBe(
      true,
    );
    expect(
      buildInAppCopy(
        "comunicado_not_sent",
        FIXTURES.comunicado_not_sent as never,
      ),
    ).toEqual({
      title: "No se envió «Cambio de horario de armado»",
      body: "Estaba programado para el sáb, 31 oct, 9:00 AM y el envío se atrasó más de una hora. Quedó como borrador para que lo revises.",
      actionPath: "/dashboard/communications/7",
      actionLabel: "Ver comunicado",
    });
  });

  it.each([
    [
      "late",
      "Estaba programado para el sáb, 31 oct, 9:00 AM y el envío se atrasó más de una hora. Quedó como borrador para que lo revises.",
      null,
    ],
    [
      "too_large",
      "Al enviarlo, la audiencia sumaba 3.120 personas y el máximo es 3.000. Quedó como borrador.",
      "Al enviarlo, algo de la audiencia no se pudo usar. Quedó como borrador.",
    ],
    [
      "empty",
      "Al enviarlo, nadie de la audiencia podía recibirlo. Quedó como borrador.",
      null,
    ],
    [
      "invalid",
      "Al enviarlo, la audiencia sumaba 3.120 personas y el máximo es 3.000. Quedó como borrador.",
      "Al enviarlo, algo de la audiencia no se pudo usar. Quedó como borrador.",
    ],
    [
      "sender_not_admin",
      "La persona que lo programó ya no es administradora, así que no se envió. Quedó como borrador.",
      null,
    ],
  ] as const)(
    "words the %s body, with its detail and without",
    (reason, withDetail, withoutDetail) => {
      const body = (detail: string | null) =>
        buildInAppCopy("comunicado_not_sent", {
          ...(FIXTURES.comunicado_not_sent as object),
          reason,
          detail,
        } as never).body;
      // Only the reasons that splice a detail read it.
      expect(
        body("la audiencia sumaba 3.120 personas y el máximo es 3.000"),
      ).toBe(withDetail);
      expect(body(null)).toBe(withoutDetail ?? withDetail);
      expect(body("   ")).toBe(withoutDetail ?? withDetail);
    },
  );

  it("never pushes a receipt for something the person just did", () => {
    expect(
      notificationPushes("reservation_proof_submitted", {
        ...(FIXTURES.reservation_proof_submitted as object),
        selfSubmitted: true,
      } as never),
    ).toBe(false);
    expect(
      notificationPushes("reservation_proof_submitted", {
        ...(FIXTURES.reservation_proof_submitted as object),
        selfSubmitted: false,
      } as never),
    ).toBe(true);
  });

  it("still opens the page of an item whose snapshot no longer parses", () => {
    expect(notificationOpensDetail("credit_gift_received", { nope: 1 })).toBe(
      true,
    );
    // A kind without the rule keeps following its action.
    expect(notificationOpensDetail("reservation_confirmed", { nope: 1 })).toBe(
      false,
    );
  });
});
