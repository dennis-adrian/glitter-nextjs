import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import {
  hasNotificationLogKindLabel,
  NotificationLogSearchParamsSchema,
  notificationLogKindLabel,
  notificationLogStatusLabel,
  DIRECT_EMAIL_TEMPLATE_LABELS,
  type NotificationLogDelivery,
} from "@/app/lib/notifications/admin-log-definitions";
import { NOTIFICATION_KINDS } from "@/app/lib/notifications/registry";
import { RESERVATION_NOTIFICATION_KINDS } from "@/app/lib/reservations/notification-queue";

describe("NotificationLogSearchParamsSchema", () => {
  it("defaults to every channel and status, the first page", () => {
    expect(NotificationLogSearchParamsSchema.parse({})).toEqual({
      query: "",
      channel: [],
      status: [],
      outcome: [],
      from: undefined,
      to: undefined,
      limit: 25,
      offset: 0,
    });
  });

  it("keeps known channels and statuses, once each, from one or many values", () => {
    expect(
      NotificationLogSearchParamsSchema.parse({
        channel: ["push", "email", "push", "fax"],
        status: "failed",
        outcome: ["bounced", "opened", "unknown"],
        query: "  Lola  ",
      }),
    ).toMatchObject({
      channel: ["push", "email"],
      status: ["failed"],
      outcome: ["bounced", "unknown"],
      query: "Lola",
    });
  });

  it("falls back instead of failing on a hand-edited URL", () => {
    expect(
      NotificationLogSearchParamsSchema.parse({
        from: "ayer",
        to: "2026-11-10",
        limit: "9999",
        offset: "-3",
        channel: "",
      }),
    ).toMatchObject({
      from: undefined,
      to: "2026-11-10",
      limit: 25,
      offset: 0,
      channel: [],
    });
  });
});

describe("notificationLogStatusLabel", () => {
  it("never says delivered: sent means the provider took it", () => {
    expect(notificationLogStatusLabel("email", "sent")).toBe(
      "Aceptado por Resend",
    );
    expect(notificationLogStatusLabel("push", "sent")).toBe(
      "Aceptado por el servicio push",
    );
    expect(notificationLogStatusLabel("in_app", "sent")).toBe("En la bandeja");
    expect(notificationLogStatusLabel("email", "failed")).toBe("Falló");
  });

  it("says what Resend reported once it has, for email only", () => {
    const at = new Date("2026-11-10T12:00:00Z");
    const delivery = (
      outcome: NotificationLogDelivery["outcome"],
      bounceType: string | null = null,
    ): NotificationLogDelivery => ({ outcome, at, bounceType, detail: null });

    expect(
      notificationLogStatusLabel("email", "sent", delivery("delivered")),
    ).toBe("Entregado");
    expect(
      notificationLogStatusLabel(
        "email",
        "sent",
        delivery("bounced", "Permanent"),
      ),
    ).toBe("Rebotó (permanente)");
    expect(
      notificationLogStatusLabel(
        "email",
        "sent",
        delivery("bounced", "Transient"),
      ),
    ).toBe("Rebotó (temporal)");
    expect(
      notificationLogStatusLabel("email", "sent", delivery("complained")),
    ).toBe("Reportado como spam");
    expect(
      notificationLogStatusLabel("push", "sent", delivery("delivered")),
    ).toBe("Aceptado por el servicio push");
  });
});

describe("notificationLogKindLabel", () => {
  it("names every notification kind and every reservation outbox email", () => {
    const missing = [
      ...NOTIFICATION_KINDS,
      ...RESERVATION_NOTIFICATION_KINDS,
      "comunicado_contact",
    ].filter((kind) => !hasNotificationLogKindLabel(kind));
    expect(missing).toEqual([]);
  });

  it("names every recorded email template", () => {
    for (const key of Object.keys(DIRECT_EMAIL_TEMPLATE_LABELS)) {
      expect(notificationLogKindLabel(key)).not.toBe(key);
    }
  });

  it("shows an unknown key as stored", () => {
    expect(notificationLogKindLabel("something_new")).toBe("something_new");
  });
});
