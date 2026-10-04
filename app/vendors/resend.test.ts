// @vitest-environment node
import { createElement } from "react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

const serverEnv = vi.hoisted(() => ({
  RESEND_API_KEY: "re_test",
  VERCEL_ENV: "production" as string,
}));

vi.mock("../../env", () => ({ serverEnv }));

import { sendEmail } from "@/app/vendors/resend";

const payload = {
  from: "Glitter <test@example.com>",
  to: ["buyer@example.com"],
  subject: "Test",
  html: "<p>Test</p>",
};

/** What the Resend API answers, as a real Response so the SDK can read it. */
function resendReply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sentRequest(fetchMock: Mock) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];

  return {
    url,
    init,
    headers: new Headers(init.headers),
    body: JSON.parse(String(init.body)) as Record<string, unknown>,
  };
}

describe("sendEmail", () => {
  afterEach(() => {
    serverEnv.VERCEL_ENV = "production";
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("aborts and rejects a pending Resend request after ten seconds", async () => {
    vi.useFakeTimers();
    // The SDK logs every network failure outside production.
    vi.spyOn(console, "error").mockImplementation(() => {});

    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;

        return new Promise((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(requestSignal?.reason),
            { once: true },
          );
        });
      }),
    );

    const request = sendEmail(payload);
    const rejection = expect(request).rejects.toThrow(
      "Resend request timed out",
    );

    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;

    expect(requestSignal?.aborted).toBe(true);
  });

  it("sends the idempotency key without dropping the SDK's own headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resendReply({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(payload, {
      idempotencyKey: "program-signup-42",
    });

    expect(result.data?.id).toBe("email-1");
    expect(result.error).toBeNull();

    const { url, init, headers } = sentRequest(fetchMock);
    expect(url).toBe("https://api.resend.com/emails");
    expect(headers.get("Idempotency-Key")).toBe("program-signup-42");
    expect(headers.get("Authorization")).toBe("Bearer re_test");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("User-Agent")).toMatch(/^resend-node:/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits the Idempotency-Key header when no key is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resendReply({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(payload);

    expect(sentRequest(fetchMock).headers.has("Idempotency-Key")).toBe(false);
  });

  it("returns an API error instead of throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        resendReply(
          {
            statusCode: 422,
            name: "validation_error",
            message: "Invalid `to` field.",
          },
          422,
        ),
      ),
    );

    const result = await sendEmail(payload);

    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      name: "validation_error",
      statusCode: 422,
    });
  });

  it("still lets a caller's own signal cancel the request", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        requestSignal = init?.signal ?? undefined;

        return new Promise((_resolve, reject) => {
          requestSignal?.addEventListener(
            "abort",
            () => reject(requestSignal?.reason),
            { once: true },
          );
        });
      }),
    );

    const caller = new AbortController();
    const request = sendEmail(payload, { signal: caller.signal });
    const rejection = expect(request).rejects.toThrow("caller gave up");

    await vi.waitFor(() => expect(requestSignal).toBeDefined());
    caller.abort(new Error("caller gave up"));
    await rejection;

    expect(requestSignal?.aborted).toBe(true);
  });

  it("renders a React body and sends inline attachments with their content id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resendReply({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({
      from: payload.from,
      to: payload.to,
      subject: payload.subject,
      react: createElement("p", null, "Hola"),
      attachments: [
        {
          filename: "qrcode.png",
          content: Buffer.from("qr"),
          contentId: "ticket-qrcode",
        },
      ],
    });

    const { body } = sentRequest(fetchMock);
    expect(body.html).toContain("Hola");
    expect(body).not.toHaveProperty("react");
    expect(body.attachments).toEqual([
      {
        filename: "qrcode.png",
        content: { type: "Buffer", data: [...Buffer.from("qr")] },
        content_id: "ticket-qrcode",
      },
    ]);
  });

  it("does not call Resend in development", async () => {
    serverEnv.VERCEL_ENV = "development";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendEmail(payload, { idempotencyKey: "dev-1" });

    expect(result).toEqual({ data: null, error: null, headers: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
