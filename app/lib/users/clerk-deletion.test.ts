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

  it("reads the login after a failure before deciding nothing changed", async () => {
    const failed = {
      success: false,
      status: "request_failed",
      message: "reset",
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

  it("treats a thrown call like a failed one", async () => {
    deleteClerkUser.mockRejectedValue(new Error("refused during view"));
    clerkLoginStatus.mockResolvedValue("exists");
    expect(await deleteClerkLogin("c1", 50)).toEqual({
      kind: "not_deleted",
      message: "clerk_delete_failed: refused during view",
    });
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
