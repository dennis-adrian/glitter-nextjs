import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useStandPolling } from "@/app/hooks/use-stand-polling";

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

describe("useStandPolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ stands: [], availableCount: 0, version: 1 }),
      ),
    );
    Object.defineProperty(document, "hidden", {
      configurable: true,
      writable: true,
      value: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("applies a successful payload and does not overlap in-flight polls", async () => {
    const onUpdate = vi.fn();
    let resolveFetch: ((value: unknown) => void) | undefined;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );

    renderHook(() => useStandPolling(4, 4000, onUpdate));
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(4000);
    });
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFetch?.(
        jsonResponse({
          stands: [{ standId: 1, effectiveStatus: "held", updatedAt: null }],
          availableCount: 0,
          version: 10,
        }),
      );
      await Promise.resolve();
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith({
      stands: [{ standId: 1, effectiveStatus: "held", updatedAt: null }],
      availableCount: 0,
      version: 10,
    });
  });

  it("ignores an older version after a newer payload", async () => {
    const onUpdate = vi.fn();
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({ stands: [], availableCount: 2, version: 20 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ stands: [], availableCount: 1, version: 11 }),
      );

    renderHook(() => useStandPolling(4, 4000, onUpdate));
    await act(async () => {
      await Promise.resolve();
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it("backs off after a failure and marks stale after the threshold", async () => {
    const onUpdate = vi.fn();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValue(jsonResponse({}, 500));

    const { result } = renderHook(() => useStandPolling(4, 4000, onUpdate));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.stale).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.current.stale).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(8000);
      await Promise.resolve();
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result.current.stale).toBe(true);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("aborts the in-flight request on unmount", async () => {
    let seenSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementation((_url, init) => {
      seenSignal = init?.signal;
      return new Promise(() => {});
    });

    const { unmount } = renderHook(() => useStandPolling(4, 4000, vi.fn()));
    await act(async () => {
      await Promise.resolve();
    });
    expect(seenSignal?.aborted).toBe(false);
    unmount();
    expect(seenSignal?.aborted).toBe(true);
  });
});
