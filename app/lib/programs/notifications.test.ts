import { render } from "react-email";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
}));

vi.mock("@/app/vendors/resend", () => ({
  sendEmail: sendEmailMock,
}));

import {
  sendAdminNewSignupEmail,
  sendSessionDayReminderEmail,
  type SessionDayReminderLine,
} from "@/app/lib/programs/notifications";

describe("sendAdminNewSignupEmail", () => {
  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ data: { id: "email-1" } });
  });

  it("emails every admin and identifies the session", async () => {
    const result = await sendAdminNewSignupEmail({
      purchaseId: 42,
      attendeeName: "María Pérez",
      adminEmails: ["one@example.com", "two@example.com"],
      lines: [
        {
          sessionTitle: "Taller de ilustración",
          sessionType: "workshop",
          startsAt: new Date("2026-08-10T19:00:00.000Z"),
          endsAt: new Date("2026-08-10T21:00:00.000Z"),
          unitPrice: 120,
        },
      ],
      totalAmount: 120,
      promo: {
        code: "ARTISTA50",
        partnerName: "Artista invitada",
        discountPercent: 50,
        discountAmount: 120,
      },
    });

    expect(result).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["one@example.com", "two@example.com"],
        subject: "Nueva inscripción a Taller de ilustración",
      }),
      {
        idempotencyKey: "program-admin-new-signup-42",
      },
    );

    const payload = sendEmailMock.mock.calls[0]?.[0] as {
      react: React.ReactElement;
    };
    const html = await render(payload.react);
    expect(html).toContain("María Pérez");
    expect(html).toContain("Taller de ilustración");
    expect(html).toContain("ARTISTA50");
    expect(html).toContain("Artista invitada");
    expect(html).toContain("/dashboard/programs/purchases");
  });

  it("does not call the email provider when there are no admins", async () => {
    const result = await sendAdminNewSignupEmail({
      purchaseId: 42,
      attendeeName: "María Pérez",
      adminEmails: [],
      lines: [
        {
          sessionTitle: "Taller de ilustración",
          sessionType: "workshop",
          startsAt: new Date("2026-08-10T19:00:00.000Z"),
          endsAt: new Date("2026-08-10T21:00:00.000Z"),
          unitPrice: 120,
        },
      ],
      totalAmount: 120,
    });

    expect(result).toBe(true);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});

describe("sendSessionDayReminderEmail", () => {
  const line: SessionDayReminderLine = {
    sessionTitle: "Taller de ilustración",
    sessionType: "workshop",
    programName: "Glitter Academy",
    startsAt: new Date("2026-08-10T19:00:00.000Z"),
    endsAt: new Date("2026-08-10T21:00:00.000Z"),
    venueName: "Casa Glitter",
    room: null,
    ticketCode: "GLT-8F3K2A",
  };

  beforeEach(() => {
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue({ data: { id: "email-1" } });
  });

  // The body already speaks in voseo; a tuteo subject mixed the two.
  it("writes a several-session subject in voseo, like the body", async () => {
    const result = await sendSessionDayReminderEmail({
      attendeeName: "María Pérez",
      attendeeEmail: "maria@example.com",
      lines: [line, { ...line, ticketCode: "GLT-9D1P7Q" }],
      hasAccount: true,
      idempotencyKey: "program-session-reminder-test",
    });

    expect(result).toBe(true);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ["maria@example.com"],
        subject: "Hoy tenés 2 sesiones con Glitter",
      }),
      { idempotencyKey: "program-session-reminder-test" },
    );

    const payload = sendEmailMock.mock.calls[0]?.[0] as {
      react: React.ReactElement;
    };
    const html = await render(payload.react);
    expect(html).toContain("hoy tenés");
    expect(html).toContain("/my_programs");
  });

  it("names the session in a single-session subject", async () => {
    await sendSessionDayReminderEmail({
      attendeeName: "María Pérez",
      attendeeEmail: "maria@example.com",
      lines: [line],
      hasAccount: false,
      idempotencyKey: "program-session-reminder-test",
    });

    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Hoy es tu taller: Taller de ilustración",
      }),
      { idempotencyKey: "program-session-reminder-test" },
    );
  });
});
