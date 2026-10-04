// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the festival ticket email through the real `sendEmail` and Resend SDK,
 * down to the HTTP request. The SDK rebuilds each attachment from the fields
 * it knows and silently drops the rest, so only the outgoing body shows
 * whether the QR's `cid:` reference still resolves.
 */

const { insertedTicket } = vi.hoisted(() => ({
  insertedTicket: { current: null as Record<string, unknown> | null },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
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

describe("createTicket email", () => {
  beforeEach(() => {
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
    vi.unstubAllGlobals();
  });

  it("sends the QR as the inline image the template references", async () => {
    const result = await createTicket({
      date,
      visitor: {
        ...preview.visitor,
        id: 1,
        email: "visitor@example.com",
      } as CreateTicketInput["visitor"],
      festival: preview.festival,
      numberOfVisitors: 2,
    });

    expect(result.success).toBe(true);
    // The send is not awaited by createTicket.
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

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
});
