// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the staff ticket resend through the real `sendEmail` and Resend SDK,
 * down to the HTTP request, so the assertions see what would leave: the
 * stored recipient, the inline QR, the signed tickets link and the
 * idempotency header.
 */

const {
  requireStaffMock,
  consumeActionRateLimitMock,
  findFirstMock,
  findVisitorMock,
  isSuppressedMock,
} = vi.hoisted(() => ({
  requireStaffMock: vi.fn(),
  consumeActionRateLimitMock: vi.fn(),
  findFirstMock: vi.fn(),
  // Only the registration send reads the visitor on its own.
  findVisitorMock: vi.fn(),
  isSuppressedMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: requireStaffMock,
}));
vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: consumeActionRateLimitMock,
}));
vi.mock("@/app/lib/emails/suppressions", () => ({
  isSuppressed: isSuppressedMock,
}));
vi.mock("@/db", () => ({
  db: {
    query: {
      tickets: { findFirst: findFirstMock },
      visitors: { findFirst: findVisitorMock },
    },
  },
}));

import TicketEmailTemplate from "@/app/emails/ticket";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import { resendTicketEmail } from "@/app/lib/tickets/resend-actions";
import { generateQrBuffer } from "@/app/lib/utils";
import { visitorIdFromHistoryToken } from "@/app/lib/visitors/session";
import { sendTicketIssuedEmail } from "@/app/lib/visitors/tickets";
import type { tickets } from "@/db/schema";

const preview = TicketEmailTemplate.PreviewProps;
const FAILURE =
  "No pudimos reenviar la entrada. Intentá de nuevo en unos minutos.";

function storedTicket(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    visitorId: 3,
    festivalId: preview.festival.id,
    status: "pending",
    date: new Date("2026-10-09T15:00:00.000Z"),
    numberOfVisitors: 2,
    ticketNumber: 2,
    visitor: { ...preview.visitor, id: 3, email: "visitor@example.com" },
    festival: { ...preview.festival, status: "active" },
    ...overrides,
  };
}

const fetchMock = vi.fn();

type SentBody = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  attachments: {
    content: { type: "Buffer"; data: number[] };
    content_id?: string;
  }[];
};

function sentBody(call = 0): SentBody {
  const [, init] = fetchMock.mock.calls[call] as [string, RequestInit];
  return JSON.parse(String(init.body)) as SentBody;
}

/** The token in the email's "Ver mis entradas" link. */
function ticketsLinkToken(html: string) {
  const match = html.match(/\/visitors\/tickets\/access\?token=([^"&]+)"/);
  return match ? decodeURIComponent(match[1]) : null;
}

function okResponse() {
  return new Response(JSON.stringify({ id: "email-1" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("resendTicketEmail", () => {
  beforeEach(() => {
    // The tickets link is signed with a key derived from this secret.
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_ticket_resend");
    requireStaffMock.mockReset().mockResolvedValue({ id: 1, role: "admin" });
    consumeActionRateLimitMock.mockReset().mockResolvedValue(true);
    isSuppressedMock.mockReset().mockResolvedValue(false);
    findFirstMock.mockReset().mockResolvedValue(storedTicket());
    findVisitorMock.mockReset().mockResolvedValue(storedTicket().visitor);
    fetchMock.mockReset().mockImplementation(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refuses an address that bounced or complained instead of reporting a send", async () => {
    isSuppressedMock.mockResolvedValue(true);

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message:
        "Este correo está bloqueado porque rebotó o lo marcaron como spam. Desbloquealo en Correos bloqueados y volvé a intentarlo.",
    });
    expect(isSuppressedMock).toHaveBeenCalledWith("visitor@example.com");
    expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses rather than guessing when the block list can't be read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    isSuppressedMock.mockRejectedValue(new Error("connection reset"));

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message: FAILURE,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a non-staff caller before reading anything", async () => {
    requireStaffMock.mockResolvedValue(null);

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message: "Solo un administrador puede reenviar entradas.",
    });
    expect(findFirstMock).not.toHaveBeenCalled();
    expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["7", 0, -1, 1.5, null])(
    "treats %j as a ticket that does not exist",
    async (input) => {
      await expect(resendTicketEmail(input)).resolves.toEqual({
        success: false,
        message: "No encontramos esta entrada.",
      });
      expect(findFirstMock).not.toHaveBeenCalled();
    },
  );

  it("reports a missing ticket without limiting or sending", async () => {
    findFirstMock.mockResolvedValue(undefined);

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message: "No encontramos esta entrada.",
    });
    expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a failed lookup as a generic failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    findFirstMock.mockRejectedValue(new Error("connection reset"));

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message: FAILURE,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a ticket of a festival that is not active", async () => {
    findFirstMock.mockResolvedValue(
      storedTicket({ festival: { ...preview.festival, status: "archived" } }),
    );

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message: "Solo se pueden reenviar entradas del festival activo.",
    });
    expect(consumeActionRateLimitMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a ticket without a number", async () => {
    findFirstMock.mockResolvedValue(storedTicket({ ticketNumber: null }));

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message: "Esta entrada no tiene código QR para reenviar.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stops at the rate limit", async () => {
    consumeActionRateLimitMock.mockResolvedValue(false);

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message:
        "Ya reenviamos esta entrada hace poco. Esperá unos minutos e intentá de nuevo.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the limiter is unavailable", async () => {
    consumeActionRateLimitMock.mockRejectedValue(new Error("db down"));

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message: FAILURE,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the ticket email to the stored address with the inline QR", async () => {
    const result = await resendTicketEmail(7);

    expect(result).toEqual({
      success: true,
      message: "Enviamos la entrada a visitor@example.com.",
    });
    expect(consumeActionRateLimitMock).toHaveBeenCalledWith({
      key: "ticket-resend:ticket:7",
      limit: 3,
      windowMs: 600_000,
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = sentBody();

    expect(url).toBe("https://api.resend.com/emails");
    expect(body.to).toEqual(["visitor@example.com"]);
    expect(body.subject).toBe(
      `Ya tenés tu entrada para ingresar al festival ${preview.festival.name}`,
    );
    expect(body.attachments).toHaveLength(1);

    const [attachment] = body.attachments;
    const cids = [...body.html.matchAll(/<img[^>]*\ssrc="cid:([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(cids).toEqual([attachment.content_id]);
    expect(attachment.content_id).toBe("ticket-qrcode");
    expect(Buffer.from(attachment.content.data)).toEqual(
      await generateQrBuffer("GLT05-0002"),
    );
    // Gmail on Android inverts the QR without these.
    expect(body.html).toContain('name="color-scheme" content="only light"');
    // "Ver mis entradas" opens this visitor's tickets, and only theirs.
    const token = ticketsLinkToken(body.html);
    expect(token).not.toBeNull();
    expect(visitorIdFromHistoryToken(token)).toBe(3);

    const headers = new Headers(init.headers);
    // `sendEmail` scopes every key to the environment it runs in.
    expect(headers.get("Idempotency-Key")).toMatch(
      /^production:ticket-resend-7-\d+$/,
    );
  });

  /**
   * Staff resend because the visitor lost the original, so it must be that
   * email again, not a variant of it.
   */
  it("sends the same email the visitor got when they registered", async () => {
    // Both sends sign the tickets link at the same instant. Only the clock is
    // faked: the QR encoder and the send's timeout need real timers.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-08T12:00:00.000Z"));
    const { visitor, festival, ...ticketRow } = storedTicket();

    await expect(resendTicketEmail(7)).resolves.toMatchObject({
      success: true,
    });
    await sendTicketIssuedEmail(
      ticketRow as typeof tickets.$inferSelect,
      festival as FestivalBase,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(findVisitorMock).toHaveBeenCalledOnce();
    const resent = sentBody(0);
    expect(resent.to).toEqual([visitor.email]);
    expect(resent).toEqual(sentBody(1));
  });

  it("reports a rejected send truthfully, logging only the error type", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            name: "validation_error",
            message: "visitor@example.com is invalid",
            statusCode: 422,
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    );

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message: FAILURE,
    });
    // The SDK logs its own copy of the error; this checks only ours.
    const ours = consoleError.mock.calls.filter(
      ([label]) => label === "Ticket resend email failed",
    );
    expect(ours).toEqual([
      [
        "Ticket resend email failed",
        { ticketId: 7, errorType: "resend:validation_error" },
      ],
    ]);
  });

  /**
   * The key already went out with another body, so the visitor has the
   * email; calling it a failure would only invite a pointless retry.
   */
  it("counts an already-used idempotency key as sent", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            name: "invalid_idempotent_request",
            message: "Same idempotency key used with a different payload",
            statusCode: 409,
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
    );

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: true,
      message: "Enviamos la entrada a visitor@example.com.",
    });
  });

  it("reports a network failure truthfully", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));

    await expect(resendTicketEmail(7)).resolves.toEqual({
      success: false,
      message: FAILURE,
    });
  });
});
