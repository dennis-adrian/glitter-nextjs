// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the staff ticket resend through the real `sendEmail` and Resend SDK,
 * down to the HTTP request, so the assertions see what would leave: the
 * stored recipient, the inline QR and the idempotency header.
 */

const { requireStaffMock, consumeActionRateLimitMock, findFirstMock } =
  vi.hoisted(() => ({
    requireStaffMock: vi.fn(),
    consumeActionRateLimitMock: vi.fn(),
    findFirstMock: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));
vi.mock("@/app/lib/users/helpers", () => ({
  requireAdminOrFestivalAdmin: requireStaffMock,
}));
vi.mock("@/app/lib/rate-limit", () => ({
  consumeActionRateLimit: consumeActionRateLimitMock,
}));
vi.mock("@/db", () => ({
  db: { query: { tickets: { findFirst: findFirstMock } } },
}));

import TicketEmailTemplate from "@/app/emails/ticket";
import { resendTicketEmail } from "@/app/lib/tickets/resend-actions";
import { generateQrBuffer } from "@/app/lib/utils";

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

function okResponse() {
  return new Response(JSON.stringify({ id: "email-1" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("resendTicketEmail", () => {
  beforeEach(() => {
    requireStaffMock.mockReset().mockResolvedValue({ id: 1, role: "admin" });
    consumeActionRateLimitMock.mockReset().mockResolvedValue(true);
    findFirstMock.mockReset().mockResolvedValue(storedTicket());
    fetchMock.mockReset().mockImplementation(async () => okResponse());
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    const body = JSON.parse(String(init.body)) as {
      to: string[];
      subject: string;
      html: string;
      attachments: {
        content: { type: "Buffer"; data: number[] };
        content_id?: string;
      }[];
    };

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

    const headers = new Headers(init.headers);
    // `sendEmail` scopes every key to the environment it runs in.
    expect(headers.get("Idempotency-Key")).toMatch(
      /^production:ticket-resend-7-\d+$/,
    );
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
        { ticketId: 7, errorType: "validation_error" },
      ],
    ]);
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
