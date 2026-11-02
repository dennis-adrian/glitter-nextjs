import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ScrollToTopOnOpen from "@/app/components/notifications/scroll-to-top-on-open";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ScrollToTopOnOpen", () => {
  it("opens the item at its top, instantly, and again for another item", () => {
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const { rerender } = render(<ScrollToTopOnOpen id={41} />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo).toHaveBeenCalledWith({
      top: 0,
      left: 0,
      behavior: "instant",
    });

    rerender(<ScrollToTopOnOpen id={41} />);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    rerender(<ScrollToTopOnOpen id={42} />);
    expect(scrollTo).toHaveBeenCalledTimes(2);
  });
});
