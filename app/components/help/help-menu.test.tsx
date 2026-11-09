import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  HelpContent,
  HelpDrawer,
  SidebarHelp,
} from "@/app/components/help/help-menu";

afterEach(cleanup);

function expectContactLinks() {
  expect(
    screen.getByRole("link", { name: /Escribinos/ }).getAttribute("href"),
  ).toBe("mailto:info@productoraglitter.com");
  for (const [name, href] of [
    ["Instagram", "https://www.instagram.com/glitter.bo"],
    ["TikTok", "https://tiktok.com/@glitter.bo"],
    ["Facebook", "https://www.facebook.com/glitterfestival"],
  ]) {
    const link = screen.getByRole("link", { name: new RegExp(name) });
    expect(link.getAttribute("href")).toBe(href);
    expect(link.getAttribute("target")).toBe("_blank");
  }
}

describe("Ayuda", () => {
  it("holds the footer's email and networks, and the install guide", () => {
    render(<HelpContent />);

    expectContactLinks();
    expect(
      screen.getByRole("link", { name: /Instalá la app/ }).getAttribute("href"),
    ).toBe("/instalar");
  });

  it("opens from the sidebar entry", () => {
    render(<SidebarHelp collapsed={false} />);

    expect(screen.queryByRole("link", { name: /Escribinos/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ayuda" }));
    expectContactLinks();
  });

  it("keeps its name on the collapsed rail", () => {
    render(<SidebarHelp collapsed />);

    expect(screen.getByRole("button", { name: "Ayuda" })).toBeTruthy();
  });

  it("closes the phone sheet when a link inside is followed", () => {
    const onOpenChange = vi.fn();
    render(<HelpDrawer open onOpenChange={onOpenChange} />);

    expect(screen.getByRole("dialog", { name: "Ayuda" })).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: /Instalá la app/ }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
