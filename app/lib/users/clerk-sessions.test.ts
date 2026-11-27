// @vitest-environment node
import { ClerkAPIResponseError } from "@clerk/nextjs/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sessions, refuseMock } = vi.hoisted(() => {
  type ClerkCall = (...args: unknown[]) => Promise<unknown>;
  return {
    refuseMock: vi.fn(async () => {}),
    sessions: {
      getSessionList: vi.fn<ClerkCall>(),
      revokeSession: vi.fn<ClerkCall>(async () => ({})),
    },
  };
});

vi.mock("@/db/write-guard", () => ({ refuseDuringView: refuseMock }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ sessions }),
}));

import { revokeClerkSessionsBefore } from "@/app/lib/users/clerk";

const CUTOFF = Date.UTC(2030, 0, 1);

function session(id: string, createdAt: number) {
  return { id, createdAt, status: "active" };
}

/** Answers each page out of `all`, as Clerk would. */
function listOf(all: ReturnType<typeof session>[]) {
  sessions.getSessionList.mockImplementation(async (params) => {
    const { limit, offset } = params as { limit: number; offset: number };
    return { data: all.slice(offset, offset + limit), totalCount: all.length };
  });
}

/** A Clerk failure whose message quotes an address, as the real ones can. */
function clerkError(status: number, code: string) {
  return new ClerkAPIResponseError("ana@example.com could not be processed", {
    status,
    data: [{ code, message: "ana@example.com", long_message: "ana@x.com" }],
  });
}

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  refuseMock.mockReset().mockResolvedValue(undefined);
  sessions.getSessionList.mockReset();
  sessions.revokeSession.mockReset().mockResolvedValue({});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

function expectNoAddressLogged() {
  for (const args of errorSpy.mock.calls) {
    for (const arg of args) {
      expect(typeof arg).toBe("string");
      expect(arg).not.toContain("@");
    }
  }
}

describe("revokeClerkSessionsBefore", () => {
  it("revokes only the active sessions started before the cutoff", async () => {
    listOf([
      session("sess_new", CUTOFF + 1),
      session("sess_at", CUTOFF),
      session("sess_old", CUTOFF - 1),
    ]);

    await expect(
      revokeClerkSessionsBefore("user_ana", CUTOFF),
    ).resolves.toEqual({ revoked: 1, failed: 0 });

    expect(sessions.getSessionList).toHaveBeenCalledWith({
      userId: "user_ana",
      status: "active",
      limit: 100,
      offset: 0,
    });
    expect(sessions.revokeSession.mock.calls).toEqual([["sess_old"]]);
  });

  it("reads every page before revoking", async () => {
    const all = Array.from({ length: 230 }, (_, i) =>
      session(`sess_${i}`, CUTOFF - 1000 - i),
    );
    const order: string[] = [];
    sessions.getSessionList.mockImplementation(async (params) => {
      const { limit, offset } = params as { limit: number; offset: number };
      order.push(`list:${offset}`);
      return {
        data: all.slice(offset, offset + limit),
        totalCount: all.length,
      };
    });
    sessions.revokeSession.mockImplementation(async () => {
      order.push("revoke");
      return {};
    });

    await expect(
      revokeClerkSessionsBefore("user_ana", CUTOFF),
    ).resolves.toEqual({ revoked: 230, failed: 0 });

    expect(order.slice(0, 3)).toEqual(["list:0", "list:100", "list:200"]);
    expect(
      new Set(sessions.revokeSession.mock.calls.map(([id]) => id)),
    ).toEqual(new Set(all.map((s) => s.id)));
  });

  it("stops at the total Clerk reported, even if pages keep coming full", async () => {
    sessions.getSessionList.mockImplementation(async () => ({
      data: Array.from({ length: 100 }, (_, i) => session(`sess_${i}`, 0)),
      totalCount: 250,
    }));

    await revokeClerkSessionsBefore("user_ana", CUTOFF);

    expect(sessions.getSessionList).toHaveBeenCalledTimes(3);
  });

  it("counts a session already gone as closed, not failed", async () => {
    listOf([session("sess_a", 1), session("sess_b", 2)]);
    sessions.revokeSession
      .mockRejectedValueOnce(clerkError(404, "resource_not_found"))
      .mockResolvedValueOnce({});

    await expect(
      revokeClerkSessionsBefore("user_ana", CUTOFF),
    ).resolves.toEqual({ revoked: 1, failed: 0 });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("counts a failed revoke, keeps going, and logs only the code", async () => {
    listOf([session("sess_a", 1), session("sess_b", 2)]);
    sessions.revokeSession
      .mockRejectedValueOnce(clerkError(500, "internal_clerk_error"))
      .mockResolvedValueOnce({});

    await expect(
      revokeClerkSessionsBefore("user_ana", CUTOFF),
    ).resolves.toEqual({ revoked: 1, failed: 1 });
    expect(errorSpy).toHaveBeenCalledWith(
      "Error revoking clerk session",
      "revoke_session:internal_clerk_error",
    );
    expectNoAddressLogged();
  });

  it("counts a failed list, never throws, and logs only the code", async () => {
    sessions.getSessionList.mockRejectedValue(
      clerkError(429, "too_many_requests"),
    );

    await expect(
      revokeClerkSessionsBefore("user_ana", CUTOFF),
    ).resolves.toEqual({ revoked: 0, failed: 1 });
    expect(sessions.revokeSession).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      "Error listing clerk sessions",
      "list_sessions:too_many_requests",
    );
    expectNoAddressLogged();
  });

  it("still revokes what it read when a later page fails", async () => {
    sessions.getSessionList
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => session(`sess_${i}`, 0)),
        totalCount: 150,
      })
      .mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(
      revokeClerkSessionsBefore("user_ana", CUTOFF),
    ).resolves.toEqual({ revoked: 100, failed: 1 });
    expectNoAddressLogged();
  });

  it("revokes nothing when nothing is open", async () => {
    listOf([]);

    await expect(
      revokeClerkSessionsBefore("user_ana", CUTOFF),
    ).resolves.toEqual({ revoked: 0, failed: 0 });
    expect(sessions.revokeSession).not.toHaveBeenCalled();
  });

  it("asks the view guard before Clerk", async () => {
    refuseMock.mockRejectedValue(new Error("solo lectura"));

    await expect(revokeClerkSessionsBefore("user_ana", CUTOFF)).rejects.toThrow(
      "solo lectura",
    );
    expect(sessions.getSessionList).not.toHaveBeenCalled();
    expect(sessions.revokeSession).not.toHaveBeenCalled();
  });
});
