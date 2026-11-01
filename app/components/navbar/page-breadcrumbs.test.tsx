import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAppNavigation } from "@/app/components/navbar/app-navigation";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import {
  ScreenBarProvider,
  ScreenTitle,
  usePublishScreenContext,
} from "@/app/components/navbar/screen-bar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/profiles/3/orders/1043",
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

const viewer = { role: "user", status: "verified" } as const;

function Navbar() {
  usePublishScreenContext({
    viewer,
    tabs: buildAppNavigation({ viewer }).tabs,
    activeFestival: null,
  });
  return null;
}

describe("PageBreadcrumbs", () => {
  it("shows the whole trail on desktop and the level above on a phone", () => {
    render(
      <ScreenBarProvider>
        <Navbar />
        <ScreenTitle title="Pedido #1043" />
        <PageBreadcrumbs />
      </ScreenBarProvider>,
    );

    const nav = screen.getByRole("navigation", { name: "Ruta" });
    // Hidden in the installed app, where the top bar has back and the title.
    expect(nav.hasAttribute("data-installed-hidden")).toBe(true);
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    // The phone's single link up, then the desktop trail.
    expect(hrefs).toEqual(["/my_orders", "/my_orders"]);
    expect(screen.getByText("Pedido #1043").getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("keeps its line, empty, until the navbar has streamed in", () => {
    const { container } = render(
      <ScreenBarProvider>
        <PageBreadcrumbs />
      </ScreenBarProvider>,
    );
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });
});
