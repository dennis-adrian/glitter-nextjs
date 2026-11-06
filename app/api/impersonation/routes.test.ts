// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exitMock, getImpersonationMock, startMock, store } = vi.hoisted(() => ({
  startMock: vi.fn(async () => ({ success: true, redirectTo: "/portal" })),
  exitMock: vi.fn(async () => ({
    returnTo: "/dashboard/users/2",
    ended: true,
  })),
  getImpersonationMock: vi.fn(),
  store: { get: vi.fn(), set: vi.fn() },
}));

vi.mock("next/headers", () => ({ cookies: async () => store }));
vi.mock("@/app/lib/impersonation/exit", () => ({
  exitImpersonation: exitMock,
}));
vi.mock("@/app/lib/impersonation/start", () => ({
  startImpersonation: startMock,
}));
vi.mock("@/app/lib/impersonation/viewer", () => ({
  getImpersonation: getImpersonationMock,
}));

import { GET as viewState } from "@/app/api/impersonation/route";
import { POST as exitPost } from "@/app/api/impersonation/exit/route";
import { POST as startPost } from "@/app/api/impersonation/start/route";

const ORIGIN = "https://www.glitter.com.bo";
const HOST = "www.glitter.com.bo";

function post(body?: unknown, origin: string | null = ORIGIN) {
  const headers = new Headers({
    "content-type": "application/json",
    host: HOST,
  });
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
  startMock.mockClear();
  exitMock.mockClear();
  getImpersonationMock.mockReset();
});

describe("POST /api/impersonation/exit", () => {
  it("ends the view and answers where to go, never cached", async () => {
    const response = await post();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      returnTo: "/dashboard/users/2",
      ended: true,
    });
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

  it("does not say there is no view when it cannot tell", async () => {
    getImpersonationMock.mockRejectedValue(new Error("database down"));
    const response = await viewState();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("active");
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

describe("POST /api/impersonation/start", () => {
  function start(
    body: unknown,
    headers: Record<string, string> = { origin: ORIGIN },
  ) {
    return startPost(
      new Request(`${ORIGIN}/api/impersonation/start`, {
        method: "POST",
        headers: { "content-type": "application/json", host: HOST, ...headers },
        body: JSON.stringify(body),
      }),
    );
  }

  it("starts the view and answers where to load, never cached", async () => {
    const response = await start({ subjectId: 2, returnTo: "/dashboard" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      redirectTo: "/portal",
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(startMock).toHaveBeenCalledWith(
      { subjectId: 2, returnTo: "/dashboard" },
      store,
    );
  });

  it("answers a refusal with its message", async () => {
    startMock.mockResolvedValueOnce({
      success: false,
      message: "No tenés permiso para entrar como otra cuenta.",
    } as never);
    const response = await start({ subjectId: 2 });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false });
  });

  it.each([
    ["another site's origin", { origin: "https://evil.example" }],
    ["a cross-site fetch", { "sec-fetch-site": "cross-site" }],
  ])("refuses %s, and starts nothing", async (_, headers) => {
    const response = await start({ subjectId: 2 }, headers);
    expect(response.status).toBe(403);
    expect(startMock).not.toHaveBeenCalled();
  });

  it("validates a body that is not JSON like any other bad input", async () => {
    const response = await startPost(
      new Request(`${ORIGIN}/api/impersonation/start`, {
        method: "POST",
        headers: { origin: ORIGIN, host: HOST },
        body: "not json",
      }),
    );
    expect(response.status).toBe(200);
    expect(startMock).toHaveBeenCalledWith(null, store);
  });
});
