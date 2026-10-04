// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { isAuthorizedCronRequest } from "@/app/lib/cron/auth";

const SECRET = "test-cron-secret";

function request(authorization?: string) {
  return new Request("http://localhost/api/cron/morning/job", {
    headers: authorization ? { authorization } : undefined,
  });
}

describe("isAuthorizedCronRequest", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the scheduler's bearer secret", () => {
    vi.stubEnv("CRON_SECRET", SECRET);

    expect(isAuthorizedCronRequest(request(`Bearer ${SECRET}`))).toBe(true);
  });

  it("rejects a request without an authorization header", () => {
    vi.stubEnv("CRON_SECRET", SECRET);

    expect(isAuthorizedCronRequest(request())).toBe(false);
  });

  it("rejects a wrong secret of the same length", () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const wrong = "x".repeat(SECRET.length);

    expect(isAuthorizedCronRequest(request(`Bearer ${wrong}`))).toBe(false);
  });

  it("rejects a wrong secret of a different length", () => {
    vi.stubEnv("CRON_SECRET", SECRET);

    expect(isAuthorizedCronRequest(request(`Bearer ${SECRET}-extra`))).toBe(
      false,
    );
    expect(isAuthorizedCronRequest(request("Bearer "))).toBe(false);
  });

  it("rejects the secret under any scheme but Bearer", () => {
    vi.stubEnv("CRON_SECRET", SECRET);

    expect(isAuthorizedCronRequest(request(SECRET))).toBe(false);
    expect(isAuthorizedCronRequest(request(`Basic ${SECRET}`))).toBe(false);
    expect(isAuthorizedCronRequest(request(`bearer ${SECRET}`))).toBe(false);
  });

  it("fails closed when CRON_SECRET is unset", () => {
    vi.stubEnv("CRON_SECRET", "");

    expect(isAuthorizedCronRequest(request("Bearer "))).toBe(false);
    expect(isAuthorizedCronRequest(request("Bearer undefined"))).toBe(false);
    expect(isAuthorizedCronRequest(request())).toBe(false);
  });
});
