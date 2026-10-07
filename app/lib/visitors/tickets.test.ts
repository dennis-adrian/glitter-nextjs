// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the ticket emails through the real `sendEmail` and Resend SDK, down to
 * the HTTP request. The SDK rebuilds each attachment from the fields it knows
 * and silently drops the rest, so only the outgoing body shows whether the
 * QR's `cid:` reference still resolves.
 */

const { stored } = vi.hoisted(() => ({
  // The mail goes to the visitor's stored address, read by id.
  stored: { visitor: null as Record<string, unknown> | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));
vi.mock("@/db", () => ({
  db: {
    query: { visitors: { findFirst: async () => stored.visitor } },
  },
}));

import TicketEmailTemplate from "@/app/emails/ticket";
import type { FestivalBase } from "@/app/lib/festivals/definitions";
import { generateQrBuffer } from "@/app/lib/utils";
import {
  sendTicketHistoryLinkEmail,
  sendTicketIssuedEmail,
} from "@/app/lib/visitors/tickets";
import type { tickets } from "@/db/schema";

const preview = TicketEmailTemplate.PreviewProps;
const date = new Date("2026-10-09T15:00:00.000Z");
const festival = preview.festival as FestivalBase;
const ticket = {
  id: 1,
  visitorId: 1,
  festivalId: preview.festival.id,
  status: "pending",
  date,
  numberOfVisitors: 2,
  ticketNumber: 2,
} as typeof tickets.$inferSelect;

const fetchMock = vi.fn();

function sentBody() {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    url,
    body: JSON.parse(String(init.body)) as {
      to: string[];
      html: string;
      attachments?: {
        filename: string;
        content: { type: "Buffer"; data: number[] };
        content_id?: string;
      }[];
    },
  };
}

function rejectWith(statusCode: number, name: string) {
  fetchMock.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({ statusCode, name, message: "Invalid `to` field." }),
        { status: statusCode, headers: { "content-type": "application/json" } },
      ),
  );
}

describe("ticket emails", () => {
  beforeEach(() => {
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_ticket_emails");
    stored.visitor = {
      ...preview.visitor,
      id: 1,
      email: "visitor@example.com",
    };
    fetchMock.mockReset();
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ id: "email-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the QR as the inline image the template references", async () => {
    await sendTicketIssuedEmail(ticket, festival);

    expect(fetchMock).toHaveBeenCalledOnce();
    const { url, body } = sentBody();
    expect(url).toBe("https://api.resend.com/emails");
    expect(body.to).toEqual(["visitor@example.com"]);
    expect(body.attachments).toHaveLength(1);

    const [attachment] = body.attachments!;
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
    expect(body.html).toContain("/visitors/tickets/access?token=");
  });

  it("logs a send Resend rejects instead of passing it as delivered", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    rejectWith(422, "validation_error");

    await sendTicketIssuedEmail(ticket, festival);

    expect(consoleError).toHaveBeenCalledWith("Ticket email failed", {
      ticketId: 1,
      errorType: "resend:validation_error",
    });
  });

  it("contains the send's timeout rejection", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    // Resend never answers, so `sendEmail` aborts and rejects at ten seconds.
    fetchMock.mockImplementation(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason),
            { once: true },
          );
        }),
    );

    // Only the clock `sendEmail` arms; the QR encoder needs real I/O.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const sending = sendTicketIssuedEmail(ticket, festival);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10_000);

    // Runs inside `after`: a rejection escaping here would be an unhandled
    // one in production.
    await expect(sending).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("Ticket email failed", {
      ticketId: 1,
      errorType: "Error",
    });
  });

  it("mails the history link to the stored address, and logs a rejection", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    await sendTicketHistoryLinkEmail(1);
    const { body } = sentBody();
    expect(body.to).toEqual(["visitor@example.com"]);
    expect(body.html).toContain("/visitors/tickets/access?token=");
    expect(consoleError).not.toHaveBeenCalled();

    fetchMock.mockClear();
    rejectWith(429, "rate_limit_exceeded");
    await sendTicketHistoryLinkEmail(1);
    expect(consoleError).toHaveBeenCalledWith(
      "Ticket history link email failed",
      { visitorId: 1, errorType: "resend:rate_limit_exceeded" },
    );
  });
});
