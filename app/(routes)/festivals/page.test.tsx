import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FestivalWithDates } from "@/app/lib/festivals/definitions";

const { activeMock, pastMock, redirectMock } = vi.hoisted(() => ({
  activeMock: vi.fn(),
  pastMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));

vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/app/lib/festivals/actions", () => ({
  fetchActiveFestivalBase: activeMock,
}));
vi.mock("@/app/lib/festivals/queries", () => ({
  fetchPastFestivals: pastMock,
}));

import FestivalsPage from "@/app/(routes)/festivals/page";
import NextEventPage from "@/app/next_event/page";

function festival(
  id: number,
  name: string,
  overrides: Partial<FestivalWithDates> = {},
): FestivalWithDates {
  return {
    id,
    name,
    status: "archived",
    festivalType: "glitter",
    locationLabel: "Teatro CBA",
    thumbnailUrl: null,
    posterUrl: null,
    festivalBannerUrl: null,
    festivalDates: [
      { startDate: new Date("2026-04-11T14:00:00Z") },
      { startDate: new Date("2026-04-12T14:00:00Z") },
    ],
    ...overrides,
  } as unknown as FestivalWithDates;
}

beforeEach(() => {
  activeMock.mockReset();
  pastMock.mockReset();
  redirectMock.mockClear();
});
afterEach(cleanup);

describe("/festivals", () => {
  it("opens the festival in progress", async () => {
    activeMock.mockResolvedValue({ id: 7 });

    await expect(FestivalsPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/festivals/7");
    expect(pastMock).not.toHaveBeenCalled();
  });

  it("lists the past festivals when none is in progress", async () => {
    activeMock.mockResolvedValue(undefined);
    pastMock.mockResolvedValue([
      festival(4, "Festicker 2026", { festivalType: "festicker" }),
      festival(2, "Glitter 2025"),
    ]);

    render(await FestivalsPage());

    expect(
      screen.getByRole("heading", { name: "No hay un festival en curso" }),
    ).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/festivals/4",
      "/festivals/2",
    ]);
    expect(links[0].textContent).toContain("Festicker 2026");
    expect(links[0].textContent).toContain("11–12 abr 2026");
    expect(links[0].textContent).toContain("Teatro CBA");
  });

  it("says so when there is no archive yet", async () => {
    activeMock.mockResolvedValue(undefined);
    pastMock.mockResolvedValue([]);

    render(await FestivalsPage());

    expect(
      screen.getByText("Todavía no hay festivales anteriores."),
    ).toBeTruthy();
  });
});

describe("/next_event", () => {
  it("still opens the festival in progress", async () => {
    activeMock.mockResolvedValue({ id: 7 });

    await expect(NextEventPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/festivals/7");
  });

  it("falls back to the festivals page instead of an empty screen", async () => {
    activeMock.mockResolvedValue(undefined);

    await expect(NextEventPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/festivals");
  });
});
