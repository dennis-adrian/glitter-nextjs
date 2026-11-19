import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import LinksStatistics from "@/app/dashboard/links/links-statistics";
import {
  buildLinksStatistics,
  type DailyClickRow,
  type DailyViewRow,
  type StatsLink,
} from "@/app/lib/links/statistics";

beforeAll(() => {
  // recharts measures its box; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(cleanup);

// 10:00 in La Paz on 2026-11-19.
const NOW = new Date("2026-11-19T14:00:00Z");

function link(overrides: Partial<StatsLink>): StatsLink {
  return {
    id: 1,
    kind: "link",
    label: "Tiendita",
    isVisible: true,
    visibleFrom: null,
    visibleUntil: null,
    clickCount: 0,
    ...overrides,
  };
}

function stats(input: {
  firstDay: string | null;
  views?: DailyViewRow[];
  clicks?: DailyClickRow[];
  links?: StatsLink[];
  period?: 7 | 28 | 90;
}) {
  return buildLinksStatistics({
    period: input.period ?? 7,
    now: NOW,
    firstDay: input.firstDay,
    views: input.views ?? [],
    clicks: input.clicks ?? [],
    links: input.links ?? [],
  });
}

function tile(label: string) {
  return screen.getByText(label, { selector: "p" }).parentElement!;
}

describe("LinksStatistics", () => {
  it("says there is no data yet before anything was counted", () => {
    render(
      <LinksStatistics
        stats={stats({
          firstDay: null,
          links: [link({ id: 1, label: "Tiendita", clickCount: 3456 })],
        })}
      />,
    );
    expect(screen.getByText("Todavía no hay datos")).toBeTruthy();
    // No totals, chart or rates to misread.
    expect(screen.queryByText("Tasa de clics")).toBeNull();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
    // The links are still listed, with their lifetime count.
    const row = screen.getByText("Tiendita").closest("tr")!;
    expect(within(row).getByText("3.456")).toBeTruthy();
    expect(within(row).getByText("—")).toBeTruthy();
  });

  it("offers the three periods and marks the current one", () => {
    render(<LinksStatistics stats={stats({ firstDay: null, period: 28 })} />);
    const current = screen.getByRole("link", { name: "Últimos 28 días" });
    expect(current.getAttribute("aria-current")).toBe("page");
    expect(current.getAttribute("href")).toBe(
      "/dashboard/links?vista=estadisticas&periodo=28",
    );
    expect(
      screen.getByRole("link", { name: "Últimos 7 días" }).getAttribute("href"),
    ).toBe("/dashboard/links?vista=estadisticas&periodo=7");
    expect(screen.getByRole("link", { name: "Últimos 90 días" })).toBeTruthy();
  });

  it("shows a period with no views without a made-up rate", () => {
    render(
      <LinksStatistics
        stats={stats({
          firstDay: "2026-11-15",
          views: [],
          clicks: [],
          links: [link({})],
        })}
      />,
    );
    expect(
      screen.getByText("No hubo visitas ni clics en este periodo."),
    ).toBeTruthy();
    const rate = tile("Tasa de clics");
    expect(within(rate).getByText("—")).toBeTruthy();
    expect(within(rate).getByText("Sin visitas en el periodo")).toBeTruthy();
    expect(rate.textContent).not.toContain("0 %");
    // Started inside the period, so there is nothing whole to compare with.
    expect(
      screen.getByText(/Las estadísticas empezaron el 15 nov/),
    ).toBeTruthy();
    expect(
      within(tile("Visitas")).getByText(
        "Sin periodo anterior completo para comparar",
      ),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/NaN|Infinity/);
  });

  it("shows totals, the change, the sources and the links by taps", () => {
    render(
      <LinksStatistics
        stats={stats({
          firstDay: "2026-10-01",
          views: [
            { day: "2026-11-19", source: "instagram", views: 30 },
            { day: "2026-11-18", source: "direct", views: 10 },
            { day: "2026-11-10", source: "instagram", views: 20 },
          ],
          clicks: [
            { linkId: 2, day: "2026-11-19", source: "instagram", clicks: 6 },
            { linkId: 1, day: "2026-11-18", source: "direct", clicks: 2 },
            { linkId: 9, day: "2026-11-18", source: "direct", clicks: 2 },
            { linkId: null, day: "2026-11-18", source: "direct", clicks: 0 },
            { linkId: 1, day: "2026-11-10", source: "instagram", clicks: 5 },
          ],
          links: [
            link({ id: 1, label: "Tiendita", clickCount: 29000 }),
            link({ id: 2, label: "Preinscripción", clickCount: 6 }),
            link({ id: 9, label: "Viejo", isVisible: false, clickCount: 2 }),
            link({ id: 4, kind: "social", label: "Instagram" }),
          ],
        })}
      />,
    );

    expect(within(tile("Visitas")).getByText("40")).toBeTruthy();
    expect(
      within(tile("Visitas")).getByText(/\+100\s*% vs\. periodo anterior/),
    ).toBeTruthy();
    expect(within(tile("Clics")).getByText("10")).toBeTruthy();
    expect(within(tile("Clics")).getByText(/\+100\s*%/)).toBeTruthy();
    expect(within(tile("Tasa de clics")).getByText(/25\s*%/)).toBeTruthy();

    const instagram = screen.getAllByText("Instagram")[0].closest("tr")!;
    expect(instagram.textContent).toMatch(/Instagram3062\s*0\s*%/);
    const tiktok = screen.getByText("TikTok").closest("tr")!;
    expect(within(tiktok).getByText("—")).toBeTruthy();

    const byLink = screen.getByText("Clics en el periodo").closest("table")!;
    const labels = within(byLink)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelector("td span")?.textContent);
    expect(labels).toEqual([
      "Preinscripción",
      "Tiendita",
      "Viejo",
      "Instagram",
    ]);
    const hidden = within(byLink).getByText("Viejo").closest("tr")!;
    expect(within(hidden).getByText("Oculto")).toBeTruthy();
    const tiendita = within(byLink).getByText("Tiendita").closest("tr")!;
    expect(tiendita.textContent).toContain("29.000");
    expect(within(byLink).getByText("Red social")).toBeTruthy();
  });

  it("lists the taps of deleted links together", () => {
    render(
      <LinksStatistics
        stats={stats({
          firstDay: "2026-11-01",
          views: [{ day: "2026-11-19", source: "direct", views: 4 }],
          clicks: [
            { linkId: null, day: "2026-11-19", source: "direct", clicks: 1 },
          ],
        })}
      />,
    );
    const row = screen.getByText("Enlaces eliminados").closest("tr")!;
    expect(row.textContent).toMatch(/Enlaces eliminados1100\s*%—/);
  });
});
