import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAppNavigation } from "@/app/components/navbar/app-navigation";
import AppTabBar from "@/app/components/navbar/app-tab-bar";

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));

afterEach(cleanup);

function renderTabBar(pathname: string) {
  pathnameMock.mockReturnValue(pathname);
  const { tabs } = buildAppNavigation({
    viewer: { role: "user", status: "verified" },
  });
  return render(<AppTabBar tabs={tabs} />);
}

describe("AppTabBar", () => {
  it("links the four tabs", () => {
    renderTabBar("/portal");

    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(["/portal", "/my_participations", "/merch", "/menu"]);
  });

  it("marks the tab for the current page", () => {
    renderTabBar("/merch/combos/verano");

    expect(
      screen
        .getByRole("link", { name: "Tiendita" })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: "Inicio" }).hasAttribute("aria-current"),
    ).toBe(false);
  });

  it("is only shown in the installed app below the desktop breakpoint", () => {
    const { container } = renderTabBar("/portal");
    const nav = container.querySelector("[data-app-tabbar]");

    expect(nav?.classList.contains("hidden")).toBe(true);
    expect(nav?.classList.contains("standalone:max-lg:block")).toBe(true);
  });

  it("steps aside while paying or picking a stand", () => {
    const { container } = renderTabBar(
      "/profiles/3/festivals/9/reservations/new",
    );

    expect(container.querySelector("[data-app-tabbar]")).toBeNull();
  });
});
