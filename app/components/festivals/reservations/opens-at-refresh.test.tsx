// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

import OpensAtRefresh, {
  JITTER_MAX_MS,
  JITTER_MIN_MS,
  refreshDelayMs,
} from "@/app/components/festivals/reservations/opens-at-refresh";

const NOW = Date.parse("2026-11-06T23:50:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();
const MINUTE = 60_000;

describe("refreshDelayMs", () => {
  it("is null once open, or for an unreadable date", () => {
    expect(refreshDelayMs(NOW, NOW)).toBeNull();
    expect(refreshDelayMs(NOW - 1, NOW)).toBeNull();
    expect(refreshDelayMs(NaN, NOW)).toBeNull();
    expect(refreshDelayMs(NOW + MINUTE, NaN)).toBeNull();
  });

  it("adds the jitter to what remains", () => {
    expect(refreshDelayMs(NOW + MINUTE, NOW, 0)).toBe(MINUTE + JITTER_MIN_MS);
    expect(refreshDelayMs(NOW + MINUTE, NOW, 1)).toBe(MINUTE + JITTER_MAX_MS);
    expect(refreshDelayMs(NOW + MINUTE, NOW, 0.5)).toBe(
      MINUTE + (JITTER_MIN_MS + JITTER_MAX_MS) / 2,
    );
  });
});

describe("OpensAtRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.setSystemTime(NOW);
    vi.spyOn(Math, "random").mockReturnValue(0);
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    refresh.mockReset();
    // Restore jsdom's own getter.
    delete (document as { visibilityState?: unknown }).visibilityState;
  });

  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  it("never refreshes when reservations are already open", () => {
    render(<OpensAtRefresh startsAt={iso(NOW - MINUTE)} serverNow={iso(NOW)} />);
    advance(60 * MINUTE);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes exactly once, after what remains plus the jitter", () => {
    render(
      <OpensAtRefresh startsAt={iso(NOW + 10 * MINUTE)} serverNow={iso(NOW)} />,
    );
    advance(10 * MINUTE + JITTER_MIN_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    advance(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    advance(60 * MINUTE);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("counts from the server's clock, not the phone's", () => {
    // The phone runs two minutes ahead of the server.
    vi.setSystemTime(NOW + 2 * MINUTE);
    render(
      <OpensAtRefresh startsAt={iso(NOW + 10 * MINUTE)} serverNow={iso(NOW)} />,
    );
    advance(10 * MINUTE + JITTER_MIN_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    advance(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("falls back to the phone's clock without serverNow", () => {
    render(<OpensAtRefresh startsAt={iso(NOW + MINUTE)} />);
    advance(MINUTE + JITTER_MIN_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("re-arms past setTimeout's limit instead of firing at once", () => {
    render(
      <OpensAtRefresh
        startsAt={iso(NOW + 40 * 24 * 60 * MINUTE)}
        serverNow={iso(NOW)}
      />,
    );
    advance(0);
    expect(refresh).not.toHaveBeenCalled();
    advance(30 * 24 * 60 * MINUTE);
    expect(refresh).not.toHaveBeenCalled();
    advance(10 * 24 * 60 * MINUTE + JITTER_MIN_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("catches up when a suspended tab becomes visible again", () => {
    render(<OpensAtRefresh startsAt={iso(NOW + MINUTE)} serverNow={iso(NOW)} />);
    // The phone slept through the timer: the clock moved, the timer did not.
    vi.setSystemTime(NOW + 5 * MINUTE);
    expect(refresh).not.toHaveBeenCalled();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("clears the timer on unmount", () => {
    const { unmount } = render(
      <OpensAtRefresh startsAt={iso(NOW + MINUTE)} serverNow={iso(NOW)} />,
    );
    unmount();
    advance(10 * MINUTE);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("schedules again when the server sends a new serverNow", () => {
    const startsAt = iso(NOW + 10 * MINUTE);
    const { rerender } = render(
      <OpensAtRefresh startsAt={startsAt} serverNow={iso(NOW)} />,
    );
    advance(10 * MINUTE + JITTER_MIN_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    // That refresh landed early on the server's clock: still closed.
    rerender(
      <OpensAtRefresh
        startsAt={startsAt}
        serverNow={iso(NOW + 10 * MINUTE - 30_000)}
      />,
    );
    advance(30_000 + JITTER_MIN_MS);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("renders the pull-to-refresh hint for the installed app only", () => {
    const { container } = render(
      <OpensAtRefresh startsAt={iso(NOW + MINUTE)} serverNow={iso(NOW)} />,
    );
    const hint = container.querySelector("p");
    expect(hint?.textContent).toBe(
      "En la app también podés deslizar hacia abajo para actualizar.",
    );
    expect(hint?.className).toContain("hidden");
    expect(hint?.className).toContain("standalone:block");
  });
});
