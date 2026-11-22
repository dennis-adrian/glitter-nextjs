import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_LINKS_HEADER } from "@/app/lib/links/definitions";

const fetchLinksPageMock = vi.hoisted(() => vi.fn());
const connectionMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/app/lib/links/queries", () => ({
  fetchLinksPage: fetchLinksPageMock,
}));
vi.mock("next/server", () => ({ connection: connectionMock }));
vi.mock("@/app/lib/config", () => ({ getEnvLabel: () => "[Dev]" }));

import LinksPage, * as page from "@/app/links/page";

describe("/links", () => {
  fetchLinksPageMock.mockResolvedValue({
    links: [
      {
        id: 1,
        kind: "link",
        label: "Tiendita",
        href: "https://example.com/tienda",
        icon: "link",
        iconSvg: null,
        imageUrl: null,
        layout: "classic",
      },
    ],
    socialPosition: "top",
    header: { ...DEFAULT_LINKS_HEADER, title: "Glitter links" },
  });

  it("is rendered per visit, so schedules hold after a quiet spell", async () => {
    // A cached (ISR) page would serve the last visitor's links to the next.
    expect(page).not.toHaveProperty("revalidate");
    connectionMock.mockClear();
    await LinksPage();
    expect(connectionMock).toHaveBeenCalled();
  });

  it("titles itself from the header", async () => {
    const metadata = await page.generateMetadata();
    expect(metadata.title).toEqual({
      absolute: "[Dev] Glitter links | Productora Glitter",
    });
    expect(metadata.openGraph).toMatchObject({ title: "Glitter links" });
  });

  it("shows the header and the links", async () => {
    render(await LinksPage());
    expect(screen.getByRole("heading", { name: "Glitter links" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tiendita" })).toBeTruthy();
  });
});
