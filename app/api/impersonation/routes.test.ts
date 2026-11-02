// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exitMock, getImpersonationMock, store } = vi.hoisted(() => ({
  exitMock: vi.fn(async () => ({ returnTo: "/dashboard/users/2", ended: true })),
  getImpersonationMock: vi.fn(),
  store: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("next/headers", () => ({ cookies: async () => store }));
vi.mock("@/app/lib/impersonation/exit", () => ({
  exitImpersonation: exitMock,
}));
vi.mock("@/app/lib/impersonation/viewer", () => ({
  getImpersonation: getImpersonationMock,
}));

import { GET as viewState } from "@/app/api/impersonation/route";
import { POST as exitPost } from "@/app/api/impersonation/exit/route";

const ORIGIN = "https://www.glitter.com.bo";

function post(body?: unknown, origin: string | null = ORIGIN) {
  const headers = new Headers({ "content-type": "application/json" });
  if (origin) headers.set("origin", origin);
  return exitPost(
    new Request(`${ORIGIN}/api/impersonation/exit`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  exitMock.mockClear();
  getImpersonationMock.mockReset();
});

describe("POST /api/impersonation/exit", () => {
  it("ends the view and answers where to go, never cached", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ returnTo: "/dashboard/users/2" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(exitMock).toHaveBeenCalledWith(store, "exited");
  });

  it("records a sign-out when the sign-out button asks", async () => {
    await post({ reason: "signed_out" });
    expect(exitMock).toHaveBeenCalledWith(store, "signed_out");
  });

  it("takes no other reason", async () => {
    await post({ reason: "anything" });
    expect(exitMock).toHaveBeenCalledWith(store, "exited");
  });

  it("refuses another site's form, and ends nothing", async () => {
    const response = await post(undefined, "https://evil.example");
    expect(response.status).toBe(403);
    expect(exitMock).not.toHaveBeenCalled();
  });

  it("accepts a same-origin request without an Origin header", async () => {
    const response = await post(undefined, null);
    expect(response.status).toBe(200);
  });
});

describe("GET /api/impersonation", () => {
  it("is off outside a view", async () => {
    getImpersonationMock.mockResolvedValue(null);
    const response = await viewState();
    expect(await response.json()).toEqual({ active: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("is off when the view cannot be read", async () => {
    getImpersonationMock.mockRejectedValue(new Error("database down"));
    expect(await (await viewState()).json()).toEqual({ active: false });
  });

  it("names the participant and the time left, and nothing else of theirs", async () => {
    getImpersonationMock.mockResolvedValue({
      sessionId: 41,
      secondsLeft: 1200,
      returnTo: "/dashboard",
      actor: { id: 1, clerkId: "user_admin" },
      subject: {
        id: 2,
        clerkId: "user_subject",
        displayName: "Ana",
        firstName: "Ana",
        lastName: "Pérez",
        email: "ana@example.com",
        imageUrl: null,
        phoneNumber: "+591 700 00000",
        birthdate: new Date(0),
      },
    });
    expect(await (await viewState()).json()).toEqual({
      active: true,
      secondsLeft: 1200,
      subject: {
        id: 2,
        displayName: "Ana",
        firstName: "Ana",
        lastName: "Pérez",
        email: "ana@example.com",
        imageUrl: null,
      },
    });
  });
});
