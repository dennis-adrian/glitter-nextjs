// @vitest-environment node
import { createElement } from "react";
import {
  afterEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
  type Mock,
} from "vitest";

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
function resendReply(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function throttled(headers: Record<string, string> = {}) {
  return resendReply(
    {
      statusCode: 429,
      name: "rate_limit_exceeded",
      message: "Too many requests. You can only make 10 requests per second.",
    },
    429,
    headers,
  );
}

function sentRequest(fetchMock: Mock, call = 0) {
  const [url, init] = fetchMock.mock.calls[call] as [string, RequestInit];

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

  it("retries a 429 once, after its Retry-After, with the same payload and key", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled({ "retry-after": "0.5" }))
      .mockResolvedValueOnce(resendReply({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const request = sendEmail(payload, { idempotencyKey: "program-signup-42" });

    await vi.advanceTimersByTimeAsync(499);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const result = await request;
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe("email-1");

    const first = sentRequest(fetchMock, 0);
    const retry = sentRequest(fetchMock, 1);
    expect(retry.url).toBe(first.url);
    expect(retry.body).toEqual(first.body);
    expect(retry.headers.get("Idempotency-Key")).toBe(
      "production:program-signup-42",
    );
    expect(first.headers.get("Idempotency-Key")).toBe(
      "production:program-signup-42",
    );
    // One line with the wait alone: no address, no subject.
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith("[resend] throttled, retrying once", {
      waitMs: 500,
    });
  });

  it("waits at most two seconds, whatever Retry-After asks", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled({ "retry-after": "30" }))
      .mockResolvedValueOnce(resendReply({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const request = sendEmail(payload);

    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await request).data?.id).toBe("email-1");
  });

  it("waits one second when the 429 has no Retry-After", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled())
      .mockResolvedValueOnce(resendReply({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const request = sendEmail(payload);

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((await request).data?.id).toBe("email-1");
    expect(warn).toHaveBeenCalledWith("[resend] throttled, retrying once", {
      waitMs: 1_000,
    });
  });

  it("returns a second 429 as it is instead of retrying again", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockImplementation(async () => throttled({ "retry-after": "1" }));
    vi.stubGlobal("fetch", fetchMock);

    const request = sendEmail(payload, { idempotencyKey: "k" });
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await request;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.data).toBeNull();
    expect(result.error).toMatchObject({
      name: "rate_limit_exceeded",
      statusCode: 429,
    });
    // The caller can still schedule its own retry from the reply.
    expect(result.headers?.["retry-after"]).toBe("1");
  });

  it.each([
    ["validation_error", 422],
    // A quota is a 429 too, but waiting two seconds does not lift it.
    ["daily_quota_exceeded", 429],
    ["concurrent_idempotent_requests", 409],
    ["application_error", 500],
  ] as const)("does not retry %s (%i)", async (name, statusCode) => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(
      resendReply({ statusCode, name, message: name }, statusCode, {
        "retry-after": "1",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const request = sendEmail(payload, { idempotencyKey: "k" });
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await request;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.error).toMatchObject({ name, statusCode });
  });

  it("does not retry a request that timed out, since it may have landed", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal?.reason), {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = sendEmail(payload, { idempotencyKey: "k" });
    const rejection = expect(request).rejects.toThrow(
      "Resend request timed out",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    await vi.advanceTimersByTimeAsync(15_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("gives the retry its own ten seconds", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let retrySignal: AbortSignal | undefined;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled({ "retry-after": "1" }))
      .mockImplementationOnce((_url: string, init?: RequestInit) => {
        retrySignal = init?.signal ?? undefined;
        return new Promise((_resolve, reject) => {
          retrySignal?.addEventListener(
            "abort",
            () => reject(retrySignal?.reason),
            { once: true },
          );
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const request = sendEmail(payload);
    const rejection = expect(request).rejects.toThrow(
      "Resend request timed out",
    );
    await vi.advanceTimersByTimeAsync(1_000 + 9_999);
    expect(retrySignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends nothing more when the caller gives up during the wait", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled({ "retry-after": "2" }))
      .mockResolvedValueOnce(resendReply({ id: "email-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const caller = new AbortController();
    const request = sendEmail(payload, { signal: caller.signal });
    const rejection = expect(request).rejects.toThrow("caller gave up");
    await vi.advanceTimersByTimeAsync(500);
    caller.abort(new Error("caller gave up"));
    await rejection;
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
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

  it("reads a permissive batch in development as all sent, none refused", async () => {
    serverEnv.VERCEL_ENV = "development";
    vi.spyOn(console, "log").mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue(throttled());
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendBatchEmails([payload, payload], {
      idempotencyKey: "comunicado-batch:1:x",
      batchValidation: "permissive",
    });

    expect(response.data).toEqual({
      data: [{ id: "not-sent" }, { id: "not-sent" }],
      errors: [],
    });
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
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const signal = init?.signal ?? undefined;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal?.reason), {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = sendBatchEmails([payload]);
    const rejection = expect(request).rejects.toThrow(
      "Resend request timed out",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await rejection;
    // The batch may have landed: never resent here.
    await vi.advanceTimersByTimeAsync(15_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends permissive validation when asked, and types its refused indexes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      resendReply({
        data: [{ id: "a" }],
        errors: [{ index: 1, message: "Invalid `to` field." }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendBatchEmails([payload, payload], {
      idempotencyKey: "comunicado-batch:1:x",
      batchValidation: "permissive",
    });

    expect(sentRequest(fetchMock).headers.get("x-batch-validation")).toBe(
      "permissive",
    );
    expect(response.data?.errors).toEqual([
      { index: 1, message: "Invalid `to` field." },
    ]);
    expectTypeOf<NonNullable<typeof response.data>["errors"]>().toEqualTypeOf<
      { index: number; message: string }[]
    >();
  });

  it("stays strict, in the header and the type, when no mode is given", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(resendReply({ data: [{ id: "a" }] }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await sendBatchEmails([payload], {
      idempotencyKey: "festival-invitation/x",
    });

    expect(sentRequest(fetchMock).headers.get("x-batch-validation")).toBe(
      "strict",
    );
    expect(response.data?.data).toEqual([{ id: "a" }]);
    expectTypeOf<NonNullable<typeof response.data>["errors"]>().toBeNever();
  });

  it("retries a throttled batch once, after an HTTP-date Retry-After, under the same key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        throttled({ "retry-after": "Sun, 25 Oct 2026 12:00:01 GMT" }),
      )
      .mockResolvedValueOnce(
        resendReply({ data: [{ id: "a" }, { id: "b" }], errors: [] }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const request = sendBatchEmails([payload, payload], {
      idempotencyKey: "comunicado-batch:1:x",
      batchValidation: "permissive",
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const response = await request;
    expect(response.error).toBeNull();
    expect(response.data?.data).toEqual([{ id: "a" }, { id: "b" }]);

    const first = sentRequest(fetchMock, 0);
    const retry = sentRequest(fetchMock, 1);
    expect(retry.body).toEqual(first.body);
    for (const { headers } of [first, retry]) {
      expect(headers.get("Idempotency-Key")).toBe(
        "production:comunicado-batch:1:x",
      );
      expect(headers.get("x-batch-validation")).toBe("permissive");
    }
  });

  it("returns a batch's second 429 and does not retry its other refusals", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(throttled())
      .mockResolvedValueOnce(throttled())
      .mockResolvedValueOnce(
        resendReply(
          {
            statusCode: 422,
            name: "validation_error",
            message: "Invalid `to` field.",
          },
          422,
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const twice = sendBatchEmails([payload]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await twice).error).toMatchObject({ name: "rate_limit_exceeded" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const refused = sendBatchEmails([payload]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect((await refused).error).toMatchObject({ name: "validation_error" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
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
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: async () => ({}),
        })
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
