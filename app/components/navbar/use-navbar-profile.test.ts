// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useNavbarProfile } from "@/app/components/navbar/use-navbar-profile";

const clerk = vi.hoisted(() => ({
  isSignedIn: true,
  userId: "user_1",
}));
vi.mock("@clerk/nextjs", () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: clerk.isSignedIn,
    user: clerk.isSignedIn ? { id: clerk.userId } : null,
  }),
}));

describe("useNavbarProfile", () => {
  /** Each request's own answer, in the order they were asked. */
  let requests: {
    resolve: (response: unknown) => void;
    reject: (error: unknown) => void;
  }[];
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clerk.isSignedIn = true;
    clerk.userId = "user_1";
    requests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve, reject) => requests.push({ resolve, reject })),
      ),
    );
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("says nothing of a request the browser drops while it leaves the page", async () => {
    // A redirect after the page started streaming leaves it in a full
    // navigation: the browser hides the page, then fails what is in flight.
    const { result } = renderHook(() => useNavbarProfile());
    await waitFor(() => expect(requests).toHaveLength(1));

    window.dispatchEvent(new Event("pagehide"));
    await act(async () =>
      requests[0]!.reject(new TypeError("Failed to fetch")),
    );

    expect(consoleError).not.toHaveBeenCalled();
    expect(result.current).toEqual({ profile: null, isLoading: false });
  });

  it("still reports a request that fails while the page stays", async () => {
    const { result } = renderHook(() => useNavbarProfile());
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(result.current.isLoading).toBe(true);

    const error = new TypeError("Failed to fetch");
    await act(async () => requests[0]!.reject(error));

    expect(consoleError).toHaveBeenCalledWith(error);
    expect(result.current).toEqual({ profile: null, isLoading: false });
  });

  it("loads another user afresh after a failure, and the same one again on signing in again", async () => {
    const { result, rerender } = renderHook(() => useNavbarProfile());
    await waitFor(() => expect(requests).toHaveLength(1));
    await act(async () => requests[0]!.reject(new Error("down")));
    expect(result.current.isLoading).toBe(false);

    clerk.userId = "user_2";
    rerender();
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(requests).toHaveLength(2));
    const profile = { displayName: "Ana" };
    await act(async () =>
      requests[1]!.resolve({ ok: true, json: async () => profile }),
    );
    expect(result.current).toEqual({ profile, isLoading: false });

    clerk.isSignedIn = false;
    rerender();
    clerk.isSignedIn = true;
    clerk.userId = "user_1";
    rerender();
    await waitFor(() => expect(requests).toHaveLength(3));
  });
});
