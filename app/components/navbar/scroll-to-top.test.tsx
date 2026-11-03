import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ScrollToTopOnNavigation from "@/app/components/navbar/scroll-to-top";

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));

const scrollTo = vi.fn();

function scrolledTo(y: number) {
  Object.defineProperty(window, "scrollY", { value: y, configurable: true });
}

function navigateTo(pathname: string, rerender: (ui: React.ReactNode) => void) {
  pathnameMock.mockReturnValue(pathname);
  act(() => rerender(<ScrollToTopOnNavigation />));
}

beforeEach(() => {
  pathnameMock.mockReturnValue("/portal");
  vi.stubGlobal("scrollTo", scrollTo);
  scrollTo.mockClear();
  scrolledTo(40);
  window.location.hash = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ScrollToTopOnNavigation", () => {
  it("leaves the first document where the browser put it", () => {
    render(<ScrollToTopOnNavigation />);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("opens the next screen at the top when the last one was scrolled", () => {
    const { rerender } = render(<ScrollToTopOnNavigation />);
    navigateTo("/profiles/3/festivals/1/terms", rerender);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
  });

  it("does nothing when the page is already at the top", () => {
    const { rerender } = render(<ScrollToTopOnNavigation />);
    scrolledTo(0);
    navigateTo("/my_orders", rerender);
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("keeps the browser's restored position on back and forward", () => {
    const { rerender } = render(<ScrollToTopOnNavigation />);
    navigateTo("/my_orders", rerender);
    scrollTo.mockClear();

    act(() => {
      window.history.pushState({}, "", "/portal");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    navigateTo("/portal", rerender);
    expect(scrollTo).not.toHaveBeenCalled();

    // The mark is spent: the next forward navigation lands at the top again.
    navigateTo("/my_credits", rerender);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
  });

  it("is not thrown off by a hash-only move before a navigation", () => {
    const { rerender } = render(<ScrollToTopOnNavigation />);
    act(() => {
      window.history.pushState({}, "", "/portal#abajo");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    window.location.hash = "";
    navigateTo("/my_orders", rerender);
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
  });

  it("leaves a link to an anchor to Next", () => {
    const { rerender } = render(<ScrollToTopOnNavigation />);
    window.location.hash = "#mapa";
    navigateTo("/festivals/1", rerender);
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
