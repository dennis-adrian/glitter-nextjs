// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Runs the program ticket emails through the real `sendEmail` and Resend SDK,
 * down to the HTTP request. The SDK rebuilds each attachment from the fields
 * it knows and silently drops the rest, so only the outgoing body shows
 * whether the QR's `cid:` reference still resolves.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  serverEnv: { RESEND_API_KEY: "re_test", VERCEL_ENV: "production" },
}));

import {
  sendFreeRegistrationEmail,
  sendPaymentApprovedEmail,
} from "@/app/lib/programs/notifications";
import { generateQrBuffer } from "@/app/lib/utils";

const ticket = {
  purchaseId: 12,
  attendeeName: "María Pérez",
  attendeeEmail: "maria@example.com",
  programName: "Glitter Academy",
  sessionTitle: "Cómo vivir del arte",
  sessionType: "talk" as const,
  startsAt: new Date("2026-10-09T19:00:00.000Z"),
  endsAt: new Date("2026-10-09T20:30:00.000Z"),
  venueName: "Casa Glitter",
  room: "Sala 2",
  ticketCode: "GLT-8F3K2A",
};

type SentAttachment = {
  filename: string;
  content: { type: "Buffer"; data: number[] };
  content_id?: string;
};

const fetchMock = vi.fn();

function sentRequest() {
  expect(fetchMock).toHaveBeenCalledOnce();
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

  return {
    url,
    headers: new Headers(init.headers),
    body: JSON.parse(String(init.body)) as {
      html: string;
      attachments: SentAttachment[];
    },
  };
}

/** Every `cid:` the rendered email points an image at. */
function cidReferences(html: string): string[] {
  return [...html.matchAll(/<img[^>]*\ssrc="cid:([^"]+)"/g)].map(
    (match) => match[1],
  );
}

async function expectInlineQr(ticketCode: string) {
  const { body } = sentRequest();
  const [attachment] = body.attachments;

  expect(body.attachments).toHaveLength(1);
  expect(cidReferences(body.html)).toEqual([attachment.content_id]);
  expect(attachment.content_id).toBe("program-ticket-qrcode");
  expect(Buffer.from(attachment.content.data)).toEqual(
    await generateQrBuffer(ticketCode),
  );
  // Gmail on Android inverts the QR without these.
  expect(body.html).toContain('name="color-scheme" content="only light"');
}

describe("program ticket emails", () => {
  beforeEach(() => {
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

  it("sends the registration QR as the inline image the template references", async () => {
    const sent = await sendFreeRegistrationEmail({
      ...ticket,
      accessToken: "preview-token",
    });

    expect(sent).toBe(true);
    await expectInlineQr(ticket.ticketCode);

    const { url, headers } = sentRequest();
    expect(url).toBe("https://api.resend.com/emails");
    expect(headers.get("Idempotency-Key")).toBe(
      "production:program-registration-12-GLT-8F3K2A",
    );
    expect(headers.get("Authorization")).toBe("Bearer re_test");
  });

  it("sends the payment-approved QR as the inline image the template references", async () => {
    const sent = await sendPaymentApprovedEmail({
      ...ticket,
      landingUrl: "https://example.test/programs/purchases/12?token=t",
      deliveryKey: "support-1",
    });

    expect(sent).toBe(true);
    await expectInlineQr(ticket.ticketCode);
    expect(sentRequest().headers.get("Idempotency-Key")).toBe(
      "production:program-payment-approved-12-GLT-8F3K2A-support-1",
    );
  });
});
