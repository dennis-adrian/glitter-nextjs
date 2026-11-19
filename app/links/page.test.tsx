import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_LINKS_HEADER } from "@/app/lib/links/definitions";

const fetchLinksPageMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/links/queries", () => ({
  fetchLinksPage: fetchLinksPageMock,
}));
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

  it("is rebuilt from the cache often enough for a schedule to land within a minute", () => {
    expect(page.revalidate).toBeGreaterThan(0);
    expect(page.revalidate).toBeLessThanOrEqual(30);
    expect(page).not.toHaveProperty("dynamic");
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
