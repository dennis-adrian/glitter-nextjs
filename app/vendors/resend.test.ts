import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../env", () => ({
  serverEnv: {
    RESEND_API_KEY: "re_test",
  },
}));

import { sendEmail } from "@/app/vendors/resend";

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
