// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const deleteClerkUser = vi.hoisted(() => vi.fn());
const clerkLoginStatus = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/clerk", () => ({ deleteClerkUser, clerkLoginStatus }));

import {
  checkClerkLogin,
  deleteClerkLogin,
} from "@/app/lib/users/clerk-deletion";

const never = () => new Promise<never>(() => {});

describe("deleteClerkLogin", () => {
  beforeEach(() => {
    deleteClerkUser.mockReset();
    clerkLoginStatus.mockReset();
  });

  it("is deleted when Clerk deletes it or it was already gone", async () => {
    deleteClerkUser.mockResolvedValueOnce({ success: true, status: "deleted" });
    expect(await deleteClerkLogin("c1", 50)).toEqual({ kind: "deleted" });
    deleteClerkUser.mockResolvedValueOnce({
      success: true,
      status: "already_deleted",
    });
    expect(await deleteClerkLogin("c1", 50)).toEqual({ kind: "deleted" });
    expect(clerkLoginStatus).not.toHaveBeenCalled();
  });

  it("reads the login after a refusal before deciding nothing changed", async () => {
    const failed = {
      success: false,
      status: "request_failed",
      message: "reset",
      definite: true,
    };
    deleteClerkUser.mockResolvedValue(failed);

    clerkLoginStatus.mockResolvedValueOnce("exists");
    expect(await deleteClerkLogin("c1", 50)).toEqual({
      kind: "not_deleted",
      message: "clerk_delete_failed: reset",
    });

    // The delete reached Clerk although the answer did not come back.
    clerkLoginStatus.mockResolvedValueOnce("gone");
    expect(await deleteClerkLogin("c1", 50)).toEqual({ kind: "deleted" });

    clerkLoginStatus.mockResolvedValueOnce("unknown");
    expect(await deleteClerkLogin("c1", 50)).toEqual({
      kind: "unknown",
      message: "clerk_delete_failed: reset",
    });
  });

  it("never reads a failure that may have been applied as 'not deleted'", async () => {
    // A 5xx or a dropped connection: Clerk may still apply the request after
    // the read, so the read finding the login settles nothing.
    deleteClerkUser.mockResolvedValue({
      success: false,
      status: "request_failed",
      message: "Clerk 502",
      definite: false,
    });
    clerkLoginStatus.mockResolvedValue("exists");
    expect(await deleteClerkLogin("c1", 50)).toEqual({
      kind: "unknown",
      message: "clerk_delete_failed: Clerk 502",
    });

    clerkLoginStatus.mockResolvedValue("gone");
    expect(await deleteClerkLogin("c1", 50)).toEqual({ kind: "deleted" });
  });

  it("treats a thrown call, sent to nobody, as a refusal", async () => {
    deleteClerkUser.mockRejectedValue(new Error("refused during view"));
    clerkLoginStatus.mockResolvedValue("exists");
    expect(await deleteClerkLogin("c1", 50)).toEqual({
      kind: "not_deleted",
      message: "clerk_delete_failed: refused during view",
    });
  });

  it("tells a timed-out delete to stop, so it is not sent later", async () => {
    let signal: AbortSignal | undefined;
    deleteClerkUser.mockImplementation(
      (_clerkId: string, given: AbortSignal) => {
        signal = given;
        return never();
      },
    );
    clerkLoginStatus.mockResolvedValue("exists");

    await deleteClerkLogin("c1", 20);

    expect(signal?.aborted).toBe(true);
  });

  it("never reads a timed-out delete as 'not deleted': it may still land", async () => {
    deleteClerkUser.mockImplementation(never);
    clerkLoginStatus.mockResolvedValue("exists");
    expect(await deleteClerkLogin("c1", 20)).toEqual({
      kind: "unknown",
      message: "clerk_delete_failed: timed out",
    });

    clerkLoginStatus.mockResolvedValue("gone");
    expect(await deleteClerkLogin("c1", 20)).toEqual({ kind: "deleted" });
  });
});

describe("checkClerkLogin", () => {
  it("answers unknown when Clerk hangs or throws", async () => {
    clerkLoginStatus.mockImplementationOnce(never);
    expect(await checkClerkLogin("c1", 20)).toBe("unknown");
    clerkLoginStatus.mockRejectedValueOnce(new Error("boom"));
    expect(await checkClerkLogin("c1", 20)).toBe("unknown");
    clerkLoginStatus.mockResolvedValueOnce("exists");
    expect(await checkClerkLogin("c1", 20)).toBe("exists");
  });
});
