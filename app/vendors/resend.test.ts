// @vitest-environment node
import { createElement } from "react";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";

const serverEnv = vi.hoisted(() => ({
  RESEND_API_KEY: "re_test",
  VERCEL_ENV: "production" as string,
}));

vi.mock("../../env", () => ({ serverEnv }));

import {
  removeResendSuppression,
  sendBatchEmails,
  sendEmail,
} from "@/app/vendors/resend";

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
    expect(headers.get("Idempotency-Key")).toBe("production:program-signup-42");
    expect(headers.get("Authorization")).toBe("Bearer re_test");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("User-Agent")).toMatch(/^resend-node:/);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("scopes the idempotency key to the environment", async () => {
    serverEnv.VERCEL_ENV = "preview";
    const fetchMock = vi.fn().mockResolvedValue(resendReply({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(payload, { idempotencyKey: "program-signup-42" });

    // Preview numbers purchases in its own database; unscoped, its
    // `program-signup-42` would collide with production's.
    expect(sentRequest(fetchMock).headers.get("Idempotency-Key")).toBe(
      "preview:program-signup-42",
    );
  });

  it("hashes a key that would pass Resend's 256-character limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(resendReply({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);
    const longKey = `reservation:${"x".repeat(250)}@example.com`;

    await sendEmail(payload, { idempotencyKey: longKey });

    const sentKey = sentRequest(fetchMock).headers.get("Idempotency-Key");
    expect(sentKey).toMatch(/^production:sha256:[0-9a-f]{64}$/);
    expect(sentKey!.length).toBeLessThanOrEqual(256);
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

describe("sendBatchEmails", () => {
  afterEach(() => {
    serverEnv.VERCEL_ENV = "production";
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not reach Resend in development, and says so", async () => {
    serverEnv.VERCEL_ENV = "development";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendBatchEmails([payload, payload]);
    expect(response.error).toBeNull();
    expect("simulated" in response && response.simulated).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("really sends from staging, under staging's own idempotency keys", async () => {
    serverEnv.VERCEL_ENV = "preview";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(resendReply({ data: [{ id: "a" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendBatchEmails([payload], {
      idempotencyKey: "festival-invitation/x",
    });

    expect(response.error).toBeNull();
    expect("simulated" in response).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, headers } = sentRequest(fetchMock);
    expect(url).toBe("https://api.resend.com/emails/batch");
    // Never the same key as production's mailing of the same page.
    expect(headers.get("Idempotency-Key")).toBe(
      "preview:festival-invitation/x",
    );
  });

  it("posts one batch with its scoped idempotency key and unsubscribe headers", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(resendReply({ data: [{ id: "a" }, { id: "b" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendBatchEmails(
      [
        payload,
        {
          ...payload,
          replyTo: "visitantes@example.com",
          headers: {
            "List-Unsubscribe": "<https://example.com/u?token=t>",
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        },
      ],
      { idempotencyKey: "festival-invitation/x" },
    );

    expect(response.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { url, init, headers } = sentRequest(fetchMock);
    expect(url).toBe("https://api.resend.com/emails/batch");
    const body = JSON.parse(String(init.body));
    expect(body).toHaveLength(2);
    // The SDK maps replyTo to the API's name; a pre-mapped field would be lost.
    expect(body[1].reply_to).toBe("visitantes@example.com");
    expect(body[1].headers).toEqual({
      "List-Unsubscribe": "<https://example.com/u?token=t>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(headers.get("Idempotency-Key")).toBe(
      "production:festival-invitation/x",
    );
    expect(headers.get("Authorization")).toBe("Bearer re_test");
    expect(headers.get("x-batch-validation")).toBe("strict");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects when the batch request times out, so the page is retried with the same key", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        const signal = init?.signal ?? undefined;
        return new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(signal?.reason), {
            once: true,
          });
        });
      }),
    );

    const request = sendBatchEmails([payload]);
    const rejection = expect(request).rejects.toThrow("Resend request timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
  });

  it("refuses more emails than one Resend batch holds", async () => {
    await expect(
      sendBatchEmails(Array.from({ length: 101 }, () => payload)),
    ).rejects.toThrow("at most 100");
  });
});

describe("removeResendSuppression", () => {
  afterEach(() => {
    serverEnv.VERCEL_ENV = "production";
    vi.unstubAllGlobals();
  });

  it("leaves Resend alone in development", async () => {
    serverEnv.VERCEL_ENV = "development";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await removeResendSuppression("ana@example.com")).toEqual({
      outcome: "skipped",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["production", "preview"])(
    "deletes the address from Resend's list in %s",
    async (environment) => {
      serverEnv.VERCEL_ENV = environment;
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal("fetch", fetchMock);

      expect(await removeResendSuppression("Ana+x@example.com")).toEqual({
        outcome: "removed",
      });
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        "https://api.resend.com/suppressions/Ana%2Bx%40example.com",
      );
      expect(init.method).toBe("DELETE");
      expect(new Headers(init.headers).get("Authorization")).toBe(
        "Bearer re_test",
      );
      expect(init.signal).toBeInstanceOf(AbortSignal);
    },
  );

  it("tells a missing suppression apart from a refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) })
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          json: async () => ({ message: "Suppressions are not enabled" }),
        })
        .mockRejectedValueOnce(new Error("network down")),
    );

    expect(await removeResendSuppression("a@example.com")).toEqual({
      outcome: "not_listed",
    });
    expect(await removeResendSuppression("a@example.com")).toEqual({
      outcome: "failed",
      message: "Suppressions are not enabled",
    });
    expect(await removeResendSuppression("a@example.com")).toEqual({
      outcome: "failed",
      message: "network down",
    });
  });
});
