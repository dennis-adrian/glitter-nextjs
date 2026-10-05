import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../env", () => ({
  serverEnv: {
    RESEND_API_KEY: "re_test",
  },
}));

import { serverEnv } from "../../env";
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

describe("sendEmail", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("aborts and rejects a pending Resend request after ten seconds", async () => {
    vi.useFakeTimers();

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

  it("keeps the timeout signal when adding an idempotency header", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "email-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail(payload, { idempotencyKey: "program-signup-42" });

    const requestOptions = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(requestOptions.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(requestOptions.headers).get("Idempotency-Key")).toBe(
      "program-signup-42",
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect(requestOptions.signal?.aborted).toBe(false);
  });
});

describe("sendBatchEmails", () => {
  const env = serverEnv as { VERCEL_ENV?: string };

  afterEach(() => {
    delete env.VERCEL_ENV;
    vi.unstubAllGlobals();
  });

  it("does not reach Resend outside production, and says so", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    for (const environment of [undefined, "development", "preview"]) {
      env.VERCEL_ENV = environment;
      const response = await sendBatchEmails([payload, payload]);
      expect(response.error).toBeNull();
      expect("simulated" in response && response.simulated).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts one batch with its idempotency key in production", async () => {
    env.VERCEL_ENV = "production";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: "a" }, { id: "b" }] }),
    });
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
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/emails\/batch$/);
    const body = JSON.parse(init.body as string);
    expect(body).toHaveLength(2);
    // The batch endpoint only knows the API's snake_case name.
    expect(body[1].reply_to).toBe("visitantes@example.com");
    expect(body[1].replyTo).toBeUndefined();
    // Unsubscribe headers travel per email, under the same name.
    expect(body[1].headers).toEqual({
      "List-Unsubscribe": "<https://example.com/u?token=t>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(
      "festival-invitation/x",
    );
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("refuses more emails than one Resend batch holds", async () => {
    env.VERCEL_ENV = "production";
    await expect(
      sendBatchEmails(Array.from({ length: 101 }, () => payload)),
    ).rejects.toThrow("at most 100");
  });
});

describe("removeResendSuppression", () => {
  const env = serverEnv as { VERCEL_ENV?: string };

  afterEach(() => {
    delete env.VERCEL_ENV;
    vi.unstubAllGlobals();
  });

  it("leaves the shared Resend account alone outside production", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const environment of [undefined, "development", "preview"]) {
      env.VERCEL_ENV = environment;
      expect(await removeResendSuppression("ana@example.com")).toEqual({
        outcome: "skipped",
      });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes the address from Resend's list in production", async () => {
    env.VERCEL_ENV = "production";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    expect(await removeResendSuppression("Ana+x@example.com")).toEqual({
      outcome: "removed",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/suppressions/Ana%2Bx%40example.com");
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer re_test");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("tells a missing suppression apart from a refusal", async () => {
    env.VERCEL_ENV = "production";
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
