// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    expect(result.current).toEqual({
      result: "A",
      stale: false,
      failed: false,
    });

    rerender({ q: "ab" });
    rerender({ q: "abc" });
    // The last answer stays, marked stale, while the new one is on its way.
    expect(result.current).toEqual({ result: "A", stale: true, failed: false });
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
    expect(result.current).toEqual({
      result: "NEW",
      stale: false,
      failed: false,
    });
    // …and the slow answer for the old one never replaces it.
    await act(async () => pending.get("old")!("OLD"));
    expect(result.current).toEqual({
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
    expect(result.current).toEqual({
      result: null,
      stale: false,
      failed: false,
    });

    rerender({ q: "x" });
    await advance(0);
    expect(load).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({
      result: null,
      stale: false,
      failed: true,
    });
  });
});
