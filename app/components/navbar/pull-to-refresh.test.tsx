import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PullToRefresh from "@/app/components/navbar/pull-to-refresh";
import { APP_REFRESH_EVENT } from "@/app/components/navbar/pull-refresh";

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

function installed(standalone: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: standalone && query.includes("standalone"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

/** A touch event with its touches set as a browser would (jsdom drops them). */
function touch(type: string, points: { clientX: number; clientY: number }[]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: points });
  act(() => {
    document.querySelector("main")!.dispatchEvent(event);
  });
}

function pull(dy: number) {
  touch("touchstart", [{ clientX: 100, clientY: 100 }]);
  touch("touchmove", [{ clientX: 102, clientY: 100 + dy }]);
  act(() => {
    vi.runOnlyPendingTimers();
  });
  touch("touchend", []);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout"] });
  refreshMock.mockClear();
  document.body.innerHTML = "";
  const main = document.createElement("main");
  document.body.appendChild(main);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("PullToRefresh", () => {
  it("refreshes the page and tells self-fetching widgets, past the threshold", () => {
    installed(true);
    const heard = vi.fn();
    window.addEventListener(APP_REFRESH_EVENT, heard);
    render(<PullToRefresh />);

    pull(200);

    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-pull-indicator]")).toBeTruthy();
    window.removeEventListener(APP_REFRESH_EVENT, heard);
  });

  it("lets go without refreshing before the threshold", () => {
    installed(true);
    render(<PullToRefresh />);

    pull(60);

    expect(refreshMock).not.toHaveBeenCalled();
    expect(document.querySelector("main")!.style.top).toBe("");
  });

  it("moves the page without a transform, so fixed bars inside it stay put", () => {
    installed(true);
    render(<PullToRefresh />);
    touch("touchstart", [{ clientX: 100, clientY: 100 }]);
    touch("touchmove", [{ clientX: 100, clientY: 200 }]);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    const main = document.querySelector("main")!;
    expect(main.style.transform).toBe("");
    expect(main.style.position).toBe("relative");
    expect(main.style.top).not.toBe("");
  });

  it("is not thrown off by the wobble of a finger landing", () => {
    installed(true);
    render(<PullToRefresh />);
    touch("touchstart", [{ clientX: 100, clientY: 100 }]);
    touch("touchmove", [{ clientX: 102, clientY: 99 }]);
    touch("touchmove", [{ clientX: 101, clientY: 100 }]);
    touch("touchmove", [{ clientX: 101, clientY: 300 }]);
    act(() => {
      vi.runOnlyPendingTimers();
    });
    touch("touchend", []);
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("lets go when the finger comes back above where it started", () => {
    installed(true);
    render(<PullToRefresh />);
    touch("touchstart", [{ clientX: 100, clientY: 100 }]);
    touch("touchmove", [{ clientX: 100, clientY: 300 }]);
    touch("touchmove", [{ clientX: 100, clientY: 80 }]);
    touch("touchend", []);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("lets go when a second finger lands (a pinch)", () => {
    installed(true);
    render(<PullToRefresh />);
    touch("touchstart", [{ clientX: 100, clientY: 100 }]);
    touch("touchmove", [{ clientX: 100, clientY: 300 }]);
    touch("touchstart", [
      { clientX: 100, clientY: 300 },
      { clientX: 200, clientY: 300 },
    ]);
    touch("touchend", [{ clientX: 100, clientY: 300 }]);
    touch("touchend", []);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("puts the page back to static once a pull has settled", () => {
    installed(true);
    render(<PullToRefresh />);
    pull(60);
    const main = document.querySelector("main")!;
    expect(main.style.position).toBe("relative");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(main.style.position).toBe("");
    expect(main.style.transition).toBe("");
  });

  it("leaves the page alone on a touch that never pulled", () => {
    installed(true);
    render(<PullToRefresh />);
    touch("touchstart", [{ clientX: 100, clientY: 100 }]);
    touch("touchcancel", []);
    touch("touchstart", [{ clientX: 100, clientY: 100 }]);
    touch("touchend", []);
    const main = document.querySelector("main")!;
    expect(main.style.position).toBe("");
    expect(main.style.transition).toBe("");
  });

  it("does nothing in a browser tab, which reloads on pull by itself", () => {
    installed(false);
    render(<PullToRefresh />);

    pull(200);

    expect(refreshMock).not.toHaveBeenCalled();
    expect(document.querySelector("[data-pull-indicator]")).toBeNull();
  });

  it("does nothing while a dialog is open", () => {
    installed(true);
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("data-state", "open");
    document.body.appendChild(dialog);
    render(<PullToRefresh />);

    pull(200);

    expect(refreshMock).not.toHaveBeenCalled();
  });
});
