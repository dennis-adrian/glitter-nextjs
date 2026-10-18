import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it } from "vitest";

import StandaloneSessionsSection from "@/app/components/dashboard/programs/standalone-sessions-section";

afterEach(cleanup);

type StandaloneSession = ComponentProps<
  typeof StandaloneSessionsSection
>["sessions"][number];

const NOW = new Date("2026-10-01T15:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function occurrence(
  startsInHours: number,
  lifecycleStatus: "scheduled" | "cancelled" | "completed" = "scheduled",
) {
  const startsAt = new Date(NOW.getTime() + startsInHours * HOUR);
  return {
    id: Math.round(startsInHours * 100),
    startsAt,
    endsAt: new Date(startsAt.getTime() + 2 * HOUR),
    lifecycleStatus,
  };
}

// Only the columns the list reads; the rest of the row is irrelevant here.
function session(
  overrides: Partial<StandaloneSession> & Pick<StandaloneSession, "id">,
): StandaloneSession {
  return {
    programId: null,
    title: `Sesión ${overrides.id}`,
    type: "talk",
    status: "draft",
    festival: null,
    occurrences: [],
    ...overrides,
  } as StandaloneSession;
}

describe("StandaloneSessionsSection", () => {
  it("says so when there are no standalone sessions", () => {
    render(<StandaloneSessionsSection sessions={[]} now={NOW} />);
    expect(
      screen.getByText("Todavía no hay charlas ni talleres sueltos."),
    ).toBeTruthy();
  });

  it("groups by festival, newer festivals first and Sin festival last", () => {
    render(
      <StandaloneSessionsSection
        now={NOW}
        sessions={[
          session({ id: 1, title: "Suelta" }),
          session({
            id: 2,
            title: "Del viejo",
            festival: { id: 3, name: "Glitter 2025" },
          }),
          session({
            id: 3,
            title: "Del nuevo",
            festival: { id: 9, name: "Glitter 2026" },
          }),
        ]}
      />,
    );

    const text = document.body.textContent ?? "";
    const newer = text.indexOf("Glitter 2026");
    const older = text.indexOf("Glitter 2025");
    const none = text.indexOf("Sin festival");

    expect(newer).toBeGreaterThan(-1);
    expect(newer).toBeLessThan(older);
    expect(older).toBeLessThan(none);
    expect(screen.getAllByRole("list")).toHaveLength(3);
  });

  it("links each session to its standalone admin page", () => {
    render(
      <StandaloneSessionsSection
        now={NOW}
        sessions={[session({ id: 42, title: "Cobrar sin morir" })]}
      />,
    );

    expect(
      screen
        .getByRole("link", { name: "Cobrar sin morir" })
        .getAttribute("href"),
    ).toBe("/dashboard/programs/sessions/42");
  });

  it("shows the status and says when nothing is ahead", () => {
    render(
      <StandaloneSessionsSection
        now={NOW}
        sessions={[
          session({
            id: 1,
            title: "Pasada",
            status: "published",
            occurrences: [occurrence(-5), occurrence(10, "cancelled")],
          }),
        ]}
      />,
    );

    const row = screen.getByRole("listitem");
    expect(within(row).getByText("Publicada")).toBeTruthy();
    expect(within(row).getByText(/Sin horarios próximos/)).toBeTruthy();
  });

  it("lists the soonest upcoming first within a group", () => {
    render(
      <StandaloneSessionsSection
        now={NOW}
        sessions={[
          session({ id: 1, title: "Sin nada" }),
          session({ id: 2, title: "Más tarde", occurrences: [occurrence(48)] }),
          session({
            id: 3,
            title: "Pronto",
            // Still running counts as upcoming: it is still on sale.
            occurrences: [occurrence(-1), occurrence(96)],
          }),
        ]}
      />,
    );

    const titles = screen.getAllByRole("link").map((link) => link.textContent);
    expect(titles).toEqual(["Pronto", "Más tarde", "Sin nada"]);
  });
});
