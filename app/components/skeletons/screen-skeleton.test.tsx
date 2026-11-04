import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ScreenSkeleton, {
  type ScreenSkeletonVariant,
} from "@/app/components/skeletons/screen-skeleton";

const VARIANTS: ScreenSkeletonVariant[] = [
  "list",
  "detail",
  "table",
  "grid",
  "form",
  "map",
];

describe("ScreenSkeleton", () => {
  afterEach(cleanup);

  it.each(VARIANTS)("tells assistive tech the %s screen is loading", (variant) => {
    const { container } = render(<ScreenSkeleton variant={variant} />);

    const status = screen.getByRole("status");
    expect(status.getAttribute("aria-busy")).toBe("true");
    expect(status.textContent).toContain("Cargando");
    expect(
      container.querySelector(`[data-screen-skeleton="${variant}"]`),
    ).not.toBeNull();
  });

  // The installed app's top bar already shows the title; the heading's
  // placeholder must step aside there, like the page's own back links.
  it("lets the heading placeholder step aside in the installed app", () => {
    const { container } = render(<ScreenSkeleton />);

    expect(container.querySelector("[data-installed-hidden]")).not.toBeNull();
  });
});
