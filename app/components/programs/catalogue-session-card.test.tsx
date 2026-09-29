import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import CatalogueSessionCard from "@/app/components/programs/catalogue-session-card";
import type { CatalogueSession } from "@/app/lib/programs/data";

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => ({ isLoaded: true, isSignedIn: false }),
}));

vi.mock("@/app/lib/programs/registration-actions", () => ({
  getCurrentViewerProgramEligibility: vi.fn(async () => "public"),
}));

const NOW = new Date("2026-10-01T15:00:00.000Z");
const STAMP = new Date("2026-09-01T12:00:00.000Z");

function occurrence(id: number, startsAt: string, endsAt: string) {
  return {
    id,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
    lifecycleStatus: "scheduled" as const,
    venueId: null,
  };
}

function session(overrides: Partial<CatalogueSession> = {}): CatalogueSession {
  return {
    id: 1,
    programId: null,
    festivalId: null,
    slug: "risografia",
    title: "Risografía",
    type: "workshop",
    topic: null,
    description: null,
    learningOutcomes: [],
    skillLevel: null,
    imageUrl: null,
    audience: "all",
    publicPrice: 80,
    participantPrice: null,
    status: "published",
    publishedAt: STAMP,
    venueId: null,
    displayOrder: 0,
    updatedAt: STAMP,
    createdAt: STAMP,
    occurrences: [
      occurrence(1, "2026-10-03T22:00:00.000Z", "2026-10-04T00:00:00.000Z"),
    ],
    sessionSpeakers: [
      {
        id: 1,
        sessionId: 1,
        speakerId: 1,
        role: null,
        displayOrder: 0,
        updatedAt: STAMP,
        createdAt: STAMP,
        speaker: {
          id: 1,
          publicName: "Ana Rojas",
          occupation: null,
          imageUrl: null,
          bio: null,
          links: [],
          isActive: true,
          updatedAt: STAMP,
          createdAt: STAMP,
        },
      },
    ],
    program: null,
    festival: null,
    ...overrides,
  };
}

function renderCard(value: CatalogueSession) {
  return render(
    <CatalogueSessionCard
      session={value}
      nextOccurrence={value.occurrences[0]}
      globalDiscount={{ type: "percent", value: 20 }}
      now={NOW}
    />,
  );
}

afterEach(cleanup);

describe("CatalogueSessionCard", () => {
  it("links a standalone session to its own URL and names no program", () => {
    renderCard(session());

    expect(
      screen.getByRole("link", { name: "Risografía" }).getAttribute("href"),
    ).toBe("/programs/sessions/risografia");
    expect(screen.getByText("Taller")).toBeTruthy();
    expect(screen.getByText("Con Ana Rojas")).toBeTruthy();
    expect(screen.queryByText(/Parte de/)).toBeNull();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("leads with the type and topic when there is no artwork", () => {
    const { container } = renderCard(
      session({ topic: "Cómics", description: "Imprime tu primer fanzine." }),
    );

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Imprime tu primer fanzine.")).toBeTruthy();
    expect(screen.getByText("Taller")).toBeTruthy();
    expect(screen.getByText("Cómics")).toBeTruthy();
  });

  it("shows a speaker's portrait when the session has no image", () => {
    const base = session();
    const { container } = renderCard(
      session({
        topic: "Cómics",
        sessionSpeakers: base.sessionSpeakers.map((entry) => ({
          ...entry,
          speaker: { ...entry.speaker, imageUrl: "https://utfs.io/f/ana.png" },
        })),
      }),
    );

    expect(container.querySelector("img")).not.toBeNull();
    expect(screen.getByText("Cómics")).toBeTruthy();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("links the festival of a standalone session once it is public", () => {
    renderCard(
      session({ festival: { id: 12, name: "Glitter 12", status: "active" } }),
    );

    expect(
      screen
        .getByRole("link", { name: "Parte de Glitter 12" })
        .getAttribute("href"),
    ).toBe("/festivals/12");
  });

  it("leaves out a festival that is still a draft", () => {
    renderCard(
      session({ festival: { id: 12, name: "Glitter 12", status: "draft" } }),
    );

    expect(screen.queryByText(/Parte de/)).toBeNull();
  });

  it("links a program session and its program", () => {
    renderCard(
      session({
        programId: 3,
        program: {
          id: 3,
          slug: "semana",
          name: "Semana de la Ilustración",
          status: "published",
          participantDiscountType: null,
          participantDiscountValue: null,
          festival: null,
        },
      }),
    );

    expect(
      screen.getByRole("link", { name: "Risografía" }).getAttribute("href"),
    ).toBe("/programs/semana/risografia");
    expect(
      screen
        .getByRole("link", { name: "Semana de la Ilustración" })
        .getAttribute("href"),
    ).toBe("/programs/semana");
  });

  it("notes further upcoming dates and shows the public price", async () => {
    renderCard(
      session({
        occurrences: [
          occurrence(1, "2026-10-03T22:00:00.000Z", "2026-10-04T00:00:00.000Z"),
          occurrence(2, "2026-10-10T22:00:00.000Z", "2026-10-11T00:00:00.000Z"),
        ],
      }),
    );

    expect(screen.getByText("+ 1 fecha")).toBeTruthy();
    expect(await screen.findByText("Bs 80,00")).toBeTruthy();
  });
});
