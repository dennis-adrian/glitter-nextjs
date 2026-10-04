// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs every program email through the real `sendEmail` and Resend SDK with
 * the HTTP reply mocked. Resend resolves a rejected send instead of throwing,
 * so only a reply that is actually an error shows whether a sender reads it.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));

import {
  sendAdminNewSignupEmail,
  sendFreeRegistrationEmail,
  sendPaymentApprovedEmail,
  sendPurchaseLinkEmail,
  sendSessionDayReminderEmail,
  sendVoucherChangesEmail,
  sendVoucherReceivedEmail,
  sendWaitlistInvitationEmail,
} from "@/app/lib/programs/notifications";

const HOUR = 60 * 60 * 1000;
const now = Date.now();
const startsAt = new Date(now + 7 * 24 * HOUR);
const endsAt = new Date(startsAt.getTime() + 2 * HOUR);

const ticket = {
  purchaseId: 12,
  attendeeName: "María Pérez",
  attendeeEmail: "maria@example.com",
  programName: "Glitter Academy",
  sessionTitle: "Cómo vivir del arte",
  sessionType: "talk" as const,
  startsAt,
  endsAt,
  venueName: "Casa Glitter",
  room: "Sala 2",
  ticketCode: "GLT-8F3K2A",
};

const line = {
  sessionTitle: ticket.sessionTitle,
  sessionType: ticket.sessionType,
  startsAt,
  endsAt,
  unitPrice: 120,
};

const senders: Array<[string, () => Promise<boolean>]> = [
  [
    "sendFreeRegistrationEmail",
    () => sendFreeRegistrationEmail({ ...ticket, accessToken: "token" }),
  ],
  [
    "sendVoucherReceivedEmail",
    () =>
      sendVoucherReceivedEmail({
        purchaseId: 12,
        buyerName: ticket.attendeeName,
        buyerEmail: ticket.attendeeEmail,
        lines: [line],
        totalAmount: 120,
        version: 1,
        landingUrl: null,
      }),
  ],
  [
    "sendAdminNewSignupEmail",
    () =>
      sendAdminNewSignupEmail({
        purchaseId: 12,
        attendeeName: ticket.attendeeName,
        adminEmails: ["admin@example.com"],
        lines: [line],
        totalAmount: 120,
      }),
  ],
  [
    "sendVoucherChangesEmail",
    () =>
      sendVoucherChangesEmail({
        purchaseId: 12,
        buyerName: ticket.attendeeName,
        buyerEmail: ticket.attendeeEmail,
        sessionTitle: ticket.sessionTitle,
        reason: "El comprobante no se lee.",
        landingUrl: null,
        requestedAt: new Date(now),
      }),
  ],
  [
    "sendPaymentApprovedEmail",
    () => sendPaymentApprovedEmail({ ...ticket, landingUrl: null }),
  ],
  [
    "sendPurchaseLinkEmail",
    () =>
      sendPurchaseLinkEmail({
        purchaseId: 12,
        buyerName: ticket.attendeeName,
        buyerEmail: ticket.attendeeEmail,
        sessionTitle: ticket.sessionTitle,
        secureLinkUrl: "https://example.test/programs/purchases/12?token=t",
        resentAt: new Date(now),
      }),
  ],
  [
    "sendWaitlistInvitationEmail",
    () =>
      sendWaitlistInvitationEmail({
        entryId: 5,
        occurrenceId: 9,
        buyerName: ticket.attendeeName,
        buyerEmail: ticket.attendeeEmail,
        sessionTitle: ticket.sessionTitle,
        startsAt,
        endsAt,
        expiresAt: new Date(now + 24 * HOUR),
        token: "token",
      }),
  ],
  [
    "sendSessionDayReminderEmail",
    () =>
      sendSessionDayReminderEmail({
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        lines: [ticket],
        hasAccount: true,
        idempotencyKey: "program-session-day-reminder-test",
      }),
  ],
];

const fetchMock = vi.fn();

function resendReply(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function resendError(
  name: string,
  statusCode: number,
  message = `${name} from Resend`,
) {
  return () => resendReply({ name, statusCode, message }, statusCode);
}

describe("program emails read Resend's reply", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    // The SDK logs every API error outside production, and so do the senders.
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it.each(senders)(
    "%s reports a 422 rejection as not sent",
    async (_, send) => {
      fetchMock.mockImplementation(
        resendError("validation_error", 422, "Invalid `to` field."),
      );

      await expect(send()).resolves.toBe(false);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("failed"),
        expect.objectContaining({ errorType: "resend:validation_error" }),
      );
    },
  );

  it.each(senders)(
    "%s reports a 429 rate limit as not sent",
    async (_, send) => {
      fetchMock.mockImplementation(resendError("rate_limit_exceeded", 429));

      await expect(send()).resolves.toBe(false);
    },
  );

  it.each(senders)(
    "%s counts a key already used with another body as sent",
    async (_, send) => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      fetchMock.mockImplementation(
        resendError("invalid_idempotent_request", 409),
      );

      await expect(send()).resolves.toBe(true);
    },
  );

  it.each(senders)("%s reports an accepted send as sent", async (_, send) => {
    fetchMock.mockImplementation(async () =>
      resendReply({ id: "email-1" }, 200),
    );

    await expect(send()).resolves.toBe(true);
  });
});
