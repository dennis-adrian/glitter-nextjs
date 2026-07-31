import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SmoothScrollLink from "@/app/components/programs/smooth-scroll-link";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("SmoothScrollLink", () => {
  it("scrolls on every click without leaving a hash in the URL", () => {
    window.history.replaceState({}, "", "/programs/example#programa");
    const target = document.createElement("section");
    target.id = "programa";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);

    render(
      <SmoothScrollLink targetId="programa">
        Explorar el programa
      </SmoothScrollLink>,
    );

    const link = screen.getByRole("link", { name: "Explorar el programa" });
    fireEvent.click(link);
    fireEvent.click(link);

    expect(target.scrollIntoView).toHaveBeenCalledTimes(2);
    expect(target.scrollIntoView).toHaveBeenLastCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(window.location.pathname).toBe("/programs/example");
    expect(window.location.hash).toBe("");

    target.remove();
  });
});
