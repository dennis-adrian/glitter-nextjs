import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAppNavigation } from "@/app/components/navbar/app-navigation";
import AppTabBar from "@/app/components/navbar/app-tab-bar";

const { pathnameMock } = vi.hoisted(() => ({ pathnameMock: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: pathnameMock }));

afterEach(cleanup);

function renderTabBar(pathname: string, suppliesOpen = false) {
  pathnameMock.mockReturnValue(pathname);
  const { tabs } = buildAppNavigation({
    viewer: { role: "user", status: "verified" },
    suppliesOpen,
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

  it("asks which store when the supplies market is open", async () => {
    renderTabBar("/portal", true);

    expect(screen.queryByRole("link", { name: /Tiendita/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Tiendita/ }));

    const dialog = await screen.findByRole("dialog");
    expect(
      [...dialog.querySelectorAll("a")].map((link) =>
        link.getAttribute("href"),
      ),
    ).toEqual(["/merch", "/supplies"]);
    expect(dialog.textContent).toContain("Insumos y alquileres para tu stand");
  });
});
