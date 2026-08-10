import { describe, expect, it } from "vitest";

import type { ReminderTicket } from "@/app/lib/programs/reminders";
import {
  buildSessionDayReminderKey,
  groupSessionDayReminders,
  isDeliverableAttendeeEmail,
  resolveStoreDayWindow,
} from "@/app/lib/programs/reminders";

/** 10:00 in La Paz on 2026-08-10 — when the cron actually fires. */
const RUN_AT = new Date("2026-08-10T14:00:00.000Z");

function ticket(overrides: Partial<ReminderTicket> = {}): ReminderTicket {
  return {
    ticketId: 1,
    ticketCode: "GLT-001",
    attendeeName: "Ana",
    attendeeEmail: "ana@example.com",
    attendeeUserId: null,
    sessionTitle: "Cómo vivir del arte",
    sessionType: "talk",
    programName: "Glitter Academy",
    startsAt: new Date("2026-08-10T23:00:00.000Z"),
    endsAt: new Date("2026-08-11T01:00:00.000Z"),
    venueName: "Casa Glitter",
    room: null,
    ...overrides,
  };
}

describe("resolveStoreDayWindow", () => {
  it("spans the store-local day, not the UTC day", () => {
    const today = resolveStoreDayWindow(RUN_AT);

    // Midnight in La Paz (UTC-4) is 04:00 UTC.
    expect(today.start.toISOString()).toBe("2026-08-10T04:00:00.000Z");
    expect(today.end.toISOString()).toBe("2026-08-11T04:00:00.000Z");
    expect(today.dayKey).toBe("2026-08-10");
  });

  it("still resolves to the local day just after local midnight", () => {
    // 00:30 in La Paz is already 04:30 UTC on the same calendar date, but a
    // run at 22:00 local sits on the *next* UTC date — the case a UTC-day
    // window would get wrong.
    const lateEvening = resolveStoreDayWindow(
      new Date("2026-08-11T02:00:00.000Z"),
    );

    expect(lateEvening.dayKey).toBe("2026-08-10");
    expect(lateEvening.start.toISOString()).toBe("2026-08-10T04:00:00.000Z");
  });

  it("is half-open, so a session never lands in two days", () => {
    const today = resolveStoreDayWindow(RUN_AT);
    const tomorrow = resolveStoreDayWindow(
      new Date(RUN_AT.getTime() + 24 * 60 * 60 * 1000),
    );

    expect(today.end.getTime()).toBe(tomorrow.start.getTime());
  });
});

describe("isDeliverableAttendeeEmail", () => {
  it("accepts a normal address", () => {
    expect(isDeliverableAttendeeEmail("ana@example.com")).toBe(true);
  });

  it("rejects the anonymization placeholder", () => {
    expect(
      isDeliverableAttendeeEmail("eliminado+12@perfil-eliminado.invalid"),
    ).toBe(false);
  });

  it("rejects anything without an @", () => {
    expect(isDeliverableAttendeeEmail("—")).toBe(false);
    expect(isDeliverableAttendeeEmail("  ")).toBe(false);
  });
});

describe("groupSessionDayReminders", () => {
  it("sends one message per person, not per ticket", () => {
    const reminders = groupSessionDayReminders([
      ticket({ ticketId: 1, ticketCode: "GLT-001" }),
      ticket({ ticketId: 2, ticketCode: "GLT-002", sessionType: "workshop" }),
    ]);

    expect(reminders).toHaveLength(1);
    expect(reminders[0].tickets).toHaveLength(2);
  });

  it("treats addresses case-insensitively, like the ticket index does", () => {
    const reminders = groupSessionDayReminders([
      ticket({ ticketId: 1, attendeeEmail: "Ana@Example.com" }),
      ticket({ ticketId: 2, attendeeEmail: "ana@example.com" }),
    ]);

    expect(reminders).toHaveLength(1);
    expect(reminders[0].attendeeEmail).toBe("ana@example.com");
  });

  it("orders each person's sessions chronologically", () => {
    const reminders = groupSessionDayReminders([
      ticket({
        ticketId: 2,
        ticketCode: "GLT-002",
        startsAt: new Date("2026-08-10T23:00:00.000Z"),
      }),
      ticket({
        ticketId: 1,
        ticketCode: "GLT-001",
        startsAt: new Date("2026-08-10T14:00:00.000Z"),
      }),
    ]);

    expect(reminders[0].tickets.map((t) => t.ticketCode)).toEqual([
      "GLT-001",
      "GLT-002",
    ]);
  });

  it("keeps separate people separate", () => {
    const reminders = groupSessionDayReminders([
      ticket({ ticketId: 1, attendeeEmail: "beto@example.com" }),
      ticket({ ticketId: 2, attendeeEmail: "ana@example.com" }),
    ]);

    expect(reminders.map((r) => r.attendeeEmail)).toEqual([
      "ana@example.com",
      "beto@example.com",
    ]);
  });

  it("drops anonymized attendees instead of bouncing mail at them", () => {
    const reminders = groupSessionDayReminders([
      ticket({
        ticketId: 1,
        attendeeEmail: "eliminado+1@perfil-eliminado.invalid",
      }),
      ticket({ ticketId: 2, attendeeEmail: "ana@example.com" }),
    ]);

    expect(reminders).toHaveLength(1);
    expect(reminders[0].attendeeEmail).toBe("ana@example.com");
  });

  it("marks the recipient as having an account when any ticket does", () => {
    const [guestOnly] = groupSessionDayReminders([ticket({ ticketId: 1 })]);
    expect(guestOnly.hasAccount).toBe(false);

    const [withAccount] = groupSessionDayReminders([
      ticket({ ticketId: 1 }),
      ticket({ ticketId: 2, attendeeUserId: 7 }),
    ]);
    expect(withAccount.hasAccount).toBe(true);
  });
});

describe("buildSessionDayReminderKey", () => {
  it("survives a ticket set that changed between two firings", () => {
    // The race the key exists to close: the sweep re-queries tickets every run,
    // so a seat cancelled — or bought — between a cron double-fire changes what
    // the recipient holds. The key must not move with it, or the second firing
    // mails them their second reminder of the morning.
    const beforeCancellation = groupSessionDayReminders([
      ticket({ ticketId: 1, ticketCode: "GLT-001" }),
      ticket({ ticketId: 2, ticketCode: "GLT-002" }),
    ]);
    const afterCancellation = groupSessionDayReminders([
      ticket({ ticketId: 1, ticketCode: "GLT-001" }),
    ]);
    const afterNewSeat = groupSessionDayReminders([
      ticket({ ticketId: 1, ticketCode: "GLT-001" }),
      ticket({ ticketId: 2, ticketCode: "GLT-002" }),
      ticket({ ticketId: 3, ticketCode: "GLT-003" }),
    ]);

    const keyFor = (reminders: ReturnType<typeof groupSessionDayReminders>) =>
      buildSessionDayReminderKey("2026-08-10", reminders[0].attendeeEmail);

    expect(keyFor(afterCancellation)).toBe(keyFor(beforeCancellation));
    expect(keyFor(afterNewSeat)).toBe(keyFor(beforeCancellation));
  });

  it("normalizes the address the same way the grouping does", () => {
    expect(buildSessionDayReminderKey("2026-08-10", " Ana@Example.com ")).toBe(
      buildSessionDayReminderKey("2026-08-10", "ana@example.com"),
    );
  });

  it("separates two people on the same day", () => {
    expect(
      buildSessionDayReminderKey("2026-08-10", "ana@example.com"),
    ).not.toBe(buildSessionDayReminderKey("2026-08-10", "beto@example.com"));
  });

  it("changes with the day, so tomorrow's reminder is not suppressed", () => {
    expect(
      buildSessionDayReminderKey("2026-08-10", "ana@example.com"),
    ).not.toBe(buildSessionDayReminderKey("2026-08-11", "ana@example.com"));
  });

  it("does not reuse one address's digest across days", () => {
    // The prefix alone changing is not enough: a constant digest would link the
    // same person's keys day to day and match a plain sha256(email) table.
    const digest = (key: string) => key.slice(key.lastIndexOf("-") + 1);

    expect(
      digest(buildSessionDayReminderKey("2026-08-10", "ana@example.com")),
    ).not.toBe(
      digest(buildSessionDayReminderKey("2026-08-11", "ana@example.com")),
    );
  });

  it("carries no attendee address", () => {
    const key = buildSessionDayReminderKey("2026-08-10", "ana@example.com");

    expect(key).not.toContain("@");
    expect(key).not.toContain("ana");
  });
});
