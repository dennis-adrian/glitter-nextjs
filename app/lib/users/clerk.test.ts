// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const deleteUser = vi.hoisted(() => vi.fn());
const refuseDuringView = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: async () => ({ users: { getUser, deleteUser } }),
}));
vi.mock("@/db/write-guard", () => ({ refuseDuringView }));

import { ClerkAPIResponseError } from "@clerk/nextjs/errors";

import { deleteClerkUser } from "@/app/lib/users/clerk";

/** What Clerk's API client throws when Clerk answers with an error. */
function clerkAnswer(status: number) {
  return new ClerkAPIResponseError(`Clerk ${status}`, { data: [], status });
}

describe("deleteClerkUser", () => {
  beforeEach(() => {
    getUser.mockReset();
    deleteUser.mockReset();
    refuseDuringView.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sends one DELETE, with no read before it", async () => {
    deleteUser.mockResolvedValue({});

    expect(await deleteClerkUser("c1")).toMatchObject({
      success: true,
      status: "deleted",
    });
    expect(getUser).not.toHaveBeenCalled();
    expect(deleteUser).toHaveBeenCalledWith("c1");
  });

  it("reads a 404 as a login already gone", async () => {
    deleteUser.mockRejectedValue(clerkAnswer(404));

    expect(await deleteClerkUser("c1")).toMatchObject({
      success: true,
      status: "already_deleted",
    });
  });

  it("does not send the DELETE once the caller has given up", async () => {
    const abandon = new AbortController();
    abandon.abort();

    expect(await deleteClerkUser("c1", abandon.signal)).toMatchObject({
      success: false,
      definite: true,
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("calls a refusal from Clerk definite, and anything else not", async () => {
    deleteUser.mockRejectedValueOnce(clerkAnswer(422));
    expect(await deleteClerkUser("c1")).toMatchObject({ definite: true });

    // Clerk may have applied it before failing.
    deleteUser.mockRejectedValueOnce(clerkAnswer(503));
    expect(await deleteClerkUser("c1")).toMatchObject({ definite: false });

    // The connection dropped: no answer at all.
    deleteUser.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await deleteClerkUser("c1")).toMatchObject({ definite: false });
  });
});
