import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { authMock, cookiesMock, findLiveMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  cookiesMock: vi.fn(),
  findLiveMock: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("next/headers", () => ({ cookies: cookiesMock }));
// Stands in for Next's own: rethrows only the errors Next throws on purpose.
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if (
      (error as { digest?: string } | null)?.digest === "DYNAMIC_SERVER_USAGE"
    ) {
      throw error;
    }
  },
}));
vi.mock("@/app/lib/impersonation/queries", () => ({
  findLiveImpersonation: findLiveMock,
}));

import { hashImpersonationToken } from "@/app/lib/impersonation/cookie";
import { IMPERSONATION_TOKEN_COOKIE } from "@/app/lib/impersonation/definitions";
import {
  getClerkSession,
  getImpersonation,
  getViewerClerkId,
  isImpersonating,
  isSignedIn,
} from "@/app/lib/impersonation/viewer";

const TOKEN = "a".repeat(43);
const ADMIN = { id: 1, clerkId: "user_admin", role: "admin" };
const SUBJECT = { id: 2, clerkId: "user_subject", role: "user" };

function signedIn(userId = ADMIN.clerkId, sessionId = "sess_1") {
  authMock.mockResolvedValue({ userId, sessionId });
}

function withCookie(value: string | undefined) {
  cookiesMock.mockResolvedValue({
    get: (name: string) =>
      name === IMPERSONATION_TOKEN_COOKIE && value !== undefined
        ? { name, value }
        : undefined,
  });
}

function liveRow(overrides: { adminClerkId?: string } = {}) {
  return {
    session: {
      id: 41,
      adminClerkId: overrides.adminClerkId ?? ADMIN.clerkId,
      returnTo: "/dashboard/users/2",
    },
    admin: ADMIN,
    subject: SUBJECT,
    secondsLeft: 1200,
  };
}

beforeEach(() => {
  authMock.mockReset();
  cookiesMock.mockReset();
  findLiveMock.mockReset();
});

describe("getClerkSession", () => {
  it("is whoever is signed in", async () => {
    signedIn();
    expect(await getClerkSession()).toEqual({
      userId: ADMIN.clerkId,
      sessionId: "sess_1",
    });
    expect(await isSignedIn()).toBe(true);
  });

  it("is nobody when signed out, or when Clerk cannot be read", async () => {
    authMock.mockResolvedValue({ userId: null, sessionId: null });
    expect(await getClerkSession()).toBeNull();
    authMock.mockRejectedValue(new Error("no request"));
    expect(await getClerkSession()).toBeNull();
    expect(await isSignedIn()).toBe(false);
  });
});

describe("Next's own throws", () => {
  const dynamicUsage = Object.assign(new Error("Dynamic server usage"), {
    digest: "DYNAMIC_SERVER_USAGE",
  });

  it("reach Next from Clerk, so a prerender knows the page is dynamic", async () => {
    authMock.mockRejectedValue(dynamicUsage);
    await expect(getClerkSession()).rejects.toBe(dynamicUsage);
    await expect(isSignedIn()).rejects.toBe(dynamicUsage);
  });

  it("reach Next from the cookie read", async () => {
    signedIn();
    cookiesMock.mockRejectedValue(dynamicUsage);
    await expect(getImpersonation()).rejects.toBe(dynamicUsage);
    await expect(isImpersonating()).rejects.toBe(dynamicUsage);
  });

  it("reach Next from the guard's Clerk read", async () => {
    withCookie(TOKEN);
    authMock.mockRejectedValue(dynamicUsage);
    await expect(isImpersonating()).rejects.toBe(dynamicUsage);
  });
});

describe("getViewerClerkId", () => {
  it("is the signed-in person without a view cookie", async () => {
    signedIn();
    withCookie(undefined);
    expect(await getViewerClerkId()).toBe(ADMIN.clerkId);
    expect(findLiveMock).not.toHaveBeenCalled();
  });

  it("never looks up a cookie that is not one of ours", async () => {
    signedIn();
    withCookie("not-a-token");
    expect(await getViewerClerkId()).toBe(ADMIN.clerkId);
    expect(findLiveMock).not.toHaveBeenCalled();
  });

  it("is the participant during a live view", async () => {
    signedIn();
    withCookie(TOKEN);
    findLiveMock.mockResolvedValue(liveRow());
    expect(await getViewerClerkId()).toBe(SUBJECT.clerkId);
    expect(findLiveMock).toHaveBeenCalledWith({
      tokenHash: hashImpersonationToken(TOKEN),
      adminClerkSessionId: "sess_1",
    });
  });

  it("is the signed-in person when the cookie opens nothing", async () => {
    signedIn();
    withCookie(TOKEN);
    findLiveMock.mockResolvedValue(null);
    expect(await getViewerClerkId()).toBe(ADMIN.clerkId);
  });

  it("never hands a view to a session of someone else", async () => {
    signedIn("user_other");
    withCookie(TOKEN);
    findLiveMock.mockResolvedValue(liveRow());
    expect(await getViewerClerkId()).toBe("user_other");
    expect(await getImpersonation()).toBeNull();
  });

  it("is nobody when signed out, whatever the cookie says", async () => {
    authMock.mockResolvedValue({ userId: null, sessionId: null });
    withCookie(TOKEN);
    findLiveMock.mockResolvedValue(liveRow());
    expect(await getViewerClerkId()).toBeNull();
    expect(findLiveMock).not.toHaveBeenCalled();
  });
});

describe("getImpersonation", () => {
  it("describes the live view", async () => {
    signedIn();
    withCookie(TOKEN);
    findLiveMock.mockResolvedValue(liveRow());
    expect(await getImpersonation()).toEqual({
      sessionId: 41,
      actor: ADMIN,
      subject: SUBJECT,
      secondsLeft: 1200,
      returnTo: "/dashboard/users/2",
    });
  });
});

describe("isImpersonating", () => {
  it("is false outside a request", async () => {
    cookiesMock.mockRejectedValue(new Error("outside a request scope"));
    expect(await isImpersonating()).toBe(false);
  });

  it("is false without a view cookie, and asks nothing else", async () => {
    withCookie(undefined);
    expect(await isImpersonating()).toBe(false);
    expect(authMock).not.toHaveBeenCalled();
    expect(findLiveMock).not.toHaveBeenCalled();
  });

  it("is true during a live view", async () => {
    signedIn();
    withCookie(TOKEN);
    findLiveMock.mockResolvedValue(liveRow());
    expect(await isImpersonating()).toBe(true);
  });

  it("is false when the cookie opens nothing", async () => {
    signedIn();
    withCookie(TOKEN);
    findLiveMock.mockResolvedValue(null);
    expect(await isImpersonating()).toBe(false);
  });

  it("is false for a signed-out request carrying a cookie", async () => {
    authMock.mockResolvedValue({ userId: null, sessionId: null });
    withCookie(TOKEN);
    expect(await isImpersonating()).toBe(false);
  });

  it("fails closed when Clerk cannot be read and a cookie is present", async () => {
    authMock.mockRejectedValue(new Error("clerk down"));
    withCookie(TOKEN);
    expect(await isImpersonating()).toBe(true);
  });

  it("fails closed when the view cannot be looked up", async () => {
    signedIn();
    withCookie(TOKEN);
    findLiveMock.mockRejectedValue(new Error("database down"));
    expect(await isImpersonating()).toBe(true);
  });
});
