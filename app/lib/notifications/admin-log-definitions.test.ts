import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({ db: {} }));

import {
  hasNotificationLogKindLabel,
  notificationLogHrefWithoutUser,
  NotificationLogSearchParamsSchema,
  notificationLogUserHref,
  notificationLogKindLabel,
  notificationLogStatusLabel,
} from "@/app/lib/notifications/admin-log-definitions";
import { NOTIFICATION_KINDS } from "@/app/lib/notifications/registry";
import { RESERVATION_NOTIFICATION_KINDS } from "@/app/lib/reservations/notification-queue";

describe("NotificationLogSearchParamsSchema", () => {
  it("defaults to every channel and status, the first page", () => {
    expect(NotificationLogSearchParamsSchema.parse({})).toEqual({
      query: "",
      channel: [],
      status: [],
      from: undefined,
      to: undefined,
      limit: 25,
      offset: 0,
      user: undefined,
    });
  });

  it("reads one account id for the per-person view", () => {
    expect(NotificationLogSearchParamsSchema.parse({ user: "42" }).user).toBe(
      42,
    );
    for (const user of ["0", "-3", "4.5", "lola", "#42", "", "99999999999"]) {
      expect(NotificationLogSearchParamsSchema.parse({ user }).user).toBe(
        undefined,
      );
    }
    expect(
      NotificationLogSearchParamsSchema.parse({ user: ["1", "2"] }).user,
    ).toBe(undefined);
  });

  it("keeps known channels and statuses, once each, from one or many values", () => {
    expect(
      NotificationLogSearchParamsSchema.parse({
        channel: ["push", "email", "push", "fax"],
        status: "failed",
        query: "  Lola  ",
      }),
    ).toMatchObject({
      channel: ["push", "email"],
      status: ["failed"],
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

  it("shows an unknown key as stored", () => {
    expect(notificationLogKindLabel("something_new")).toBe("something_new");
  });
});

describe("per-person links", () => {
  it("opens the log filtered to one account", () => {
    expect(notificationLogUserHref(42)).toBe(
      "/dashboard/notifications?user=42",
    );
  });

  it("clears the person but keeps the other filters, from the first page", () => {
    expect(
      notificationLogHrefWithoutUser({
        user: "42",
        status: ["failed", "skipped"],
        channel: "",
        from: "2026-11-01",
        query: "lola",
        offset: "50",
        limit: "50",
        to: undefined,
      }),
    ).toBe(
      "/dashboard/notifications?status=failed&status=skipped&channel=&from=2026-11-01&query=lola&limit=50",
    );
    expect(notificationLogHrefWithoutUser({ user: "42", offset: "25" })).toBe(
      "/dashboard/notifications",
    );
  });
});
