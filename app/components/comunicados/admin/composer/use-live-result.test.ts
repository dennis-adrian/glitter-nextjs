// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { retryDelayMs } from "@/app/components/comunicados/admin/composer/use-autosave";
import { useLiveResult } from "@/app/components/comunicados/admin/composer/use-live-result";

const DELAY = 600;

/** A load whose answers the test releases in any order. */
function manualLoad() {
  const pending = new Map<string, (result: string) => void>();
  const load = vi.fn(
    (input: { q: string }) =>
      new Promise<string>((resolve) => {
        pending.set(input.q, resolve);
      }),
  );
  return { load, pending };
}

/** What the screen shows, without `retry`. */
function shown({
  result,
  stale,
  failed,
}: {
  result: unknown;
  stale: boolean;
  failed: boolean;
}) {
  return { result, stale, failed };
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("useLiveResult", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("asks at once on open, then only after the input settles", async () => {
    const { load, pending } = manualLoad();
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useLiveResult({ input: { q }, load, delayMs: DELAY }),
      { initialProps: { q: "a" } },
    );
    await advance(0);
    expect(load).toHaveBeenCalledTimes(1);
    await act(async () => pending.get("a")!("A"));
    expect(shown(result.current)).toEqual({
      result: "A",
      stale: false,
      failed: false,
    });

    rerender({ q: "ab" });
    rerender({ q: "abc" });
    // The last answer stays, marked stale, while the new one is on its way.
    expect(shown(result.current)).toEqual({
      result: "A",
      stale: true,
      failed: false,
    });
    await advance(DELAY - 1);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith({ q: "abc" });
  });

  it("drops an answer that arrives after a newer one", async () => {
    const { load, pending } = manualLoad();
    const { result, rerender } = renderHook(
      ({ q }: { q: string }) =>
        useLiveResult({ input: { q }, load, delayMs: DELAY }),
      { initialProps: { q: "old" } },
    );
    await advance(0);
    rerender({ q: "new" });
    await advance(DELAY);
    expect(load).toHaveBeenCalledTimes(2);

    // The newer question is answered first…
    await act(async () => pending.get("new")!("NEW"));
    expect(shown(result.current)).toEqual({
      result: "NEW",
      stale: false,
      failed: false,
    });
    // …and the slow answer for the old one never replaces it.
    await act(async () => pending.get("old")!("OLD"));
    expect(shown(result.current)).toEqual({
      result: "NEW",
      stale: false,
      failed: false,
    });
  });

  it("asks nothing for a null input, and reports a thrown load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn().mockRejectedValue(new Error("network"));
    const { result, rerender } = renderHook(
      ({ q }: { q: string | null }) =>
        useLiveResult({
          input: q === null ? null : { q },
          load,
          delayMs: DELAY,
        }),
      { initialProps: { q: null as string | null } },
    );
    await advance(DELAY * 2);
    expect(load).not.toHaveBeenCalled();
    expect(shown(result.current)).toEqual({
      result: null,
      stale: false,
      failed: false,
    });

    rerender({ q: "x" });
    await advance(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(shown(result.current)).toEqual({
      result: null,
      stale: false,
      failed: true,
    });
  });

  it("asks again for the same input while it keeps failing, each time later", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("A");
    const { result } = renderHook(() =>
      useLiveResult({ input: { q: "a" }, load, delayMs: DELAY }),
    );
    await advance(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(shown(result.current)).toEqual({
      result: null,
      stale: false,
      failed: true,
    });

    await advance(retryDelayMs(1) - 1);
    await advance(0);
    expect(load).toHaveBeenCalledTimes(1);
    await advance(1);
    await advance(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith({ q: "a" });
    // Still failing: the error stays while the next try waits longer.
    expect(result.current.failed).toBe(true);

    await advance(retryDelayMs(2) - 1);
    await advance(0);
    expect(load).toHaveBeenCalledTimes(2);
    await advance(1);
    await advance(0);
    expect(load).toHaveBeenCalledTimes(3);
    expect(shown(result.current)).toEqual({
      result: "A",
      stale: false,
      failed: false,
    });

    // Answered: nothing more is asked.
    await advance(retryDelayMs(10) * 2);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("asks again at once on retry, without a second try waiting behind it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce("A");
    const { result } = renderHook(() =>
      useLiveResult({ input: { q: "a" }, load, delayMs: DELAY }),
    );
    await advance(0);
    expect(result.current.failed).toBe(true);

    act(() => result.current.retry());
    await advance(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(shown(result.current)).toEqual({
      result: "A",
      stale: false,
      failed: false,
    });
    await advance(retryDelayMs(1) * 4);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("asks again after an answer the caller counts as a failure, keeping it", async () => {
    const failure = { success: false, message: "No pudimos contar." };
    const load = vi
      .fn()
      .mockResolvedValueOnce(failure)
      .mockResolvedValueOnce({ success: true });
    const { result } = renderHook(() =>
      useLiveResult({
        input: { q: "a" },
        load,
        delayMs: DELAY,
        failedWhen: (answer: { success: boolean }) => !answer.success,
      }),
    );
    await advance(0);
    expect(shown(result.current)).toEqual({
      result: failure,
      stale: false,
      failed: true,
    });
    await advance(retryDelayMs(1));
    await advance(0);
    expect(load).toHaveBeenCalledTimes(2);
    expect(shown(result.current)).toEqual({
      result: { success: true },
      stale: false,
      failed: false,
    });
  });

  it("stops asking for an input that is no longer on screen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const load = vi.fn((input: { q: string }) =>
      input.q === "old"
        ? Promise.reject(new Error("network"))
        : new Promise<string>(() => {}),
    );
    const { rerender } = renderHook(
      ({ q }: { q: string }) =>
        useLiveResult({ input: { q }, load, delayMs: DELAY }),
      { initialProps: { q: "old" } },
    );
    await advance(0);
    rerender({ q: "new" });
    await advance(retryDelayMs(1) * 4);
    expect(load.mock.calls.map(([input]) => input.q)).toEqual(["old", "new"]);
  });
});
