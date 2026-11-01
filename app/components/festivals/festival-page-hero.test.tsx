import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

import FestivalPageHero from "@/app/components/festivals/festival-page-hero";
import type { PublicFestivalPage } from "@/app/lib/festivals/definitions";

afterEach(cleanup);

function festival(overrides: Partial<PublicFestivalPage> = {}): PublicFestivalPage {
  return {
    id: 9,
    name: "Festicker 2026",
    status: "active",
    publicRegistration: true,
    locationLabel: "Casa de la Cultura",
    festivalBannerUrl: "/banner.webp",
    posterUrl: "/poster.webp",
    thumbnailUrl: null,
    festivalDates: [
      // 10:00 to 19:00 in La Paz.
      { startDate: new Date("2026-11-14T14:00:00Z"), endDate: new Date("2026-11-14T23:00:00Z") },
      { startDate: new Date("2026-11-15T14:00:00Z"), endDate: new Date("2026-11-15T23:00:00Z") },
    ],
    festivalActivities: [],
    ...overrides,
  } as unknown as PublicFestivalPage;
}

const NOW = new Date("2026-10-24T14:00:00Z");

describe("FestivalPageHero", () => {
  it("shows the banner whole, one line of days, venue and countdown, the hours and one ticket button", () => {
    render(<FestivalPageHero festival={festival()} hasFastPass={false} now={NOW} />);

    expect(screen.getByRole("heading", { level: 1, name: "Festicker 2026" })).toBeTruthy();
    expect(
      screen.getByText("14 y 15 de noviembre · Casa de la Cultura · faltan 21 días"),
    ).toBeTruthy();
    expect(screen.getByText("10:00 AM a 7:00 PM")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("src")).toBe("/banner.webp");
    expect(
      screen.getByRole("link", { name: "Obtener entrada" }).getAttribute("href"),
    ).toBe("/festivals/9/registration");
    // The guide below leads to the map; the hero has no map button.
    expect(screen.queryByRole("link", { name: /mapa/i })).toBeNull();
  });

  it("falls back to the poster without a banner, and says when there are no tickets", () => {
    render(
      <FestivalPageHero
        festival={festival({ festivalBannerUrl: null, publicRegistration: false })}
        hasFastPass={false}
        now={NOW}
      />,
    );

    expect(screen.getByRole("img", { name: "Afiche de Festicker 2026" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Obtener entrada" })).toBeNull();
    expect(screen.getByText("No hay entradas habilitadas")).toBeTruthy();
  });
});
