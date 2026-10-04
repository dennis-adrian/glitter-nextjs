// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the festival ticket email through the real `sendEmail` and Resend SDK,
 * down to the HTTP request. The SDK rebuilds each attachment from the fields
 * it knows and silently drops the rest, so only the outgoing body shows
 * whether the QR's `cid:` reference still resolves.
 */

const { insertedTicket, afterCallbacks } = vi.hoisted(() => ({
  insertedTicket: { current: null as Record<string, unknown> | null },
  /** Work `createTicket` handed to `after`, run once the response is out. */
  afterCallbacks: [] as Array<() => unknown>,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => {
    afterCallbacks.push(callback);
  },
}));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));
vi.mock("@/db", () => {
  const tx = {
    execute: async () => ({ rows: [] }),
    // No ticket yet for this visitor; the festival's highest number is 1.
    select: (fields?: unknown) => ({
      from: () => ({
        where: async () => (fields ? [{ highest: 1 }] : []),
      }),
    }),
    insert: () => ({
      values: () => ({ returning: async () => [insertedTicket.current] }),
    }),
  };

  return {
    db: {
      transaction: async (run: (transaction: typeof tx) => unknown) => run(tx),
    },
  };
});

import { createTicket } from "@/app/data/tickets/actions";
import TicketEmailTemplate from "@/app/emails/ticket";
import { generateQrBuffer } from "@/app/lib/utils";

type CreateTicketInput = Parameters<typeof createTicket>[0];

const preview = TicketEmailTemplate.PreviewProps;
const date = new Date("2026-10-09T15:00:00.000Z");

const fetchMock = vi.fn();

function registerVisitor() {
  return createTicket({
    date,
    visitor: {
      ...preview.visitor,
      id: 1,
      email: "visitor@example.com",
    } as CreateTicketInput["visitor"],
    festival: preview.festival,
    numberOfVisitors: 2,
  });
}

/** Runs what `after` deferred, as Next does once the response is sent. */
async function runAfterResponse() {
  await Promise.all(afterCallbacks.splice(0).map((callback) => callback()));
}

describe("createTicket email", () => {
  beforeEach(() => {
    afterCallbacks.length = 0;
    insertedTicket.current = {
      id: 1,
      visitorId: 1,
      festivalId: preview.festival.id,
      status: "pending",
      date,
      numberOfVisitors: 2,
      ticketNumber: 2,
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
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends the QR as the inline image the template references", async () => {
    const result = await registerVisitor();

    expect(result.success).toBe(true);
    // Deferred until the response is out, not left floating.
    expect(fetchMock).not.toHaveBeenCalled();
    await runAfterResponse();
    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      to: string[];
      html: string;
      attachments: {
        filename: string;
        content: { type: "Buffer"; data: number[] };
        content_id?: string;
      }[];
    };

    expect(url).toBe("https://api.resend.com/emails");
    expect(body.to).toEqual(["visitor@example.com"]);
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
  });

  it("logs a send Resend rejects instead of passing it as delivered", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    fetchMock.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            statusCode: 422,
            name: "validation_error",
            message: "Invalid `to` field.",
          }),
          { status: 422, headers: { "content-type": "application/json" } },
        ),
    );

    const result = await registerVisitor();
    expect(result.success).toBe(true);
    await runAfterResponse();

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

    await registerVisitor();
    // Only the clock `sendEmail` arms; the QR encoder needs real I/O.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const sending = runAfterResponse();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(10_000);

    // A rejection escaping here would be an unhandled one in production.
    await expect(sending).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith("Ticket email failed", {
      ticketId: 1,
      errorType: "Error",
    });
  });
});
