import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import type { DisciplinaryNotificationPayload } from "@/app/lib/infractions/notifications";
import {
  buildDisciplinaryJobNotification,
  disciplinaryJobDedupeKey,
} from "@/app/lib/notifications/mirrors/disciplinary-jobs";
import {
  buildInAppCopy,
  isSensitiveNotificationKind,
  notificationCategory,
  notificationOpensDetail,
  parseNotificationData,
} from "@/app/lib/notifications/registry";

const profile = {
  id: 21,
  email: "ana@example.test",
  displayName: "Ana",
  firstName: null,
  lastName: null,
};

function render(payload: DisciplinaryNotificationPayload, festivalId?: number) {
  const built = buildDisciplinaryJobNotification({
    deduplicationKey: "k",
    userId: profile.id,
    payload,
    festivalId,
  });
  // Through the schema, as `notify()` does before it stores anything.
  const data = parseNotificationData(built.kind, built.data);
  expect(data, `${built.kind} snapshot fails its schema`).not.toBeNull();
  return {
    kind: built.kind,
    data: data as Record<string, unknown>,
    category: notificationCategory(built.kind),
    copy: buildInAppCopy(built.kind, data as never),
    opensDetail: notificationOpensDetail(built.kind, data),
    sensitive: isSensitiveNotificationKind(built.kind),
  };
}

const infraction = {
  entityType: "infraction",
  profile,
  infractionId: 8,
  typeLabel: "No Show",
  festivalName: "Glitter Vol. 9",
  participantNote: null,
} as const;

const sanction = {
  entityType: "sanction",
  profile,
  sanctionId: 5,
  typeLabel: "Retraso de reserva",
  statusLabel: "Activa",
  scopeLabel: "Global",
  infractionLabels: ["No Show", "Incumplimiento"],
  participantNote: null,
  festivalName: null,
  reservationEligibleAt: null,
} as const;

describe("buildDisciplinaryJobNotification", () => {
  it("keys the item on the job's own key", () => {
    expect(disciplinaryJobDedupeKey("sanction:5:approved")).toBe(
      "disciplinary:sanction:5:approved",
    );
  });

  it("files a registered infraction under Cuenta, linking to the history page", () => {
    const item = render({ ...infraction, kind: "registered" });
    expect(item.kind).toBe("infraction_registered");
    expect(item.category).toBe("account");
    expect(item.sensitive).toBe(true);
    expect(item.copy).toEqual({
      title: "Se registró una infracción en tu historial",
      body: "El motivo registrado es «No Show». Corresponde a tu participación en Glitter Vol. 9.\n\nSi tenés dudas, escribinos a soporte@productoraglitter.com.",
      actionPath: "/profiles/21/infractions",
      actionLabel: "Ver mi historial",
    });
    expect(item.opensDetail).toBe(false);
  });

  it("never stores the participant's email in the inbox snapshot", () => {
    const item = render({ ...infraction, kind: "registered" });
    expect(JSON.stringify(item.data)).not.toContain("ana@example.test");
  });

  it("keeps a void reason in its own paragraph and opens the item's page", () => {
    const item = render({
      ...infraction,
      kind: "voided",
      participantNote: " Se registró por error. ",
    });
    expect(item.kind).toBe("infraction_voided");
    expect(item.copy.body).toBe(
      "Anulamos la infracción por «No Show», así que ya no se tendrá en cuenta.\n\nMotivo de la anulación: Se registró por error.\n\nSi tenés dudas, escribinos a soporte@productoraglitter.com.",
    );
    expect(item.opensDetail).toBe(true);
  });

  it("describes an approved sanction with its scope and reasons", () => {
    const item = render({ ...sanction, kind: "approved" });
    expect(item.kind).toBe("sanction_approved");
    expect(item.category).toBe("account");
    expect(item.copy.title).toBe("Se aprobó una sanción en tu historial");
    expect(item.copy.body).toBe(
      "La sanción consiste en un retraso para acceder a las reservas. Esta medida se aplicará empezando el próximo festival. La medida se tomó por los siguientes motivos: No Show, Incumplimiento.\n\nSi tenés dudas, escribinos a soporte@productoraglitter.com.",
    );
  });

  it("talks about a revoked sanction in the past tense, with its reason", () => {
    const item = render({
      ...sanction,
      kind: "revoked",
      participantNote: "Se aclaró lo ocurrido.",
    });
    expect(item.copy.body).toContain("La sanción consistía en");
    expect(item.copy.body).toContain(
      "\n\nMotivo de la revocación: Se aclaró lo ocurrido.",
    );
    expect(item.opensDetail).toBe(true);
  });

  it("links reservation access to that festival's map when the festival is known", () => {
    const opened = {
      ...sanction,
      kind: "reservation_access_enabled",
      festivalName: "Glitter Vol. 9",
      reservationEligibleAt: "2026-11-01T14:00:00.000Z",
    } as const;
    const item = render(opened, 3);
    expect(item.kind).toBe("sanction_reservation_access_enabled");
    expect(item.category).toBe("reservations");
    expect(item.sensitive).toBe(true);
    expect(item.copy.title).toBe("Ya podés acceder a las reservas");
    expect(item.copy.body).toContain("de Glitter Vol. 9 desde el");
    expect(item.copy.actionPath).toBe(
      "/profiles/21/festivals/3/reservations/new",
    );

    expect(render(opened).copy.actionPath).toBe("/profiles/21/infractions");
  });
});
