import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// The real module loads .env files and validates server secrets on import.
vi.mock("@/env", () => ({
  getClientEnv: () => ({ NEXT_PUBLIC_BASE_URL: "https://glitter.test" }),
}));

import ReservationConfirmationEmailTemplate from "@/app/emails/reservation-confirmation";

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    ReservationConfirmationEmailTemplate({
      festival: {
        id: 7,
        name: "Glitter ¡Feliz Cumple!",
        locationLabel: "Galería del CBA",
        festivalDates: [
          {
            id: 1,
            startDate: new Date("2026-11-14T18:00:00.000Z"),
            endDate: new Date("2026-11-14T23:00:00.000Z"),
          },
        ],
      },
      profile: { id: 1, displayName: "Ana Ilustra", category: "illustration" },
      standLabel: "B48",
      ...overrides,
    } as Parameters<typeof ReservationConfirmationEmailTemplate>[0]),
  );
}

describe("ReservationConfirmationEmailTemplate", () => {
  it("speaks of one space for a single stand", () => {
    const html = render({ standCount: 1 });

    expect(html).toContain("Tu reserva para el espacio <strong>B48</strong>");
    expect(html).toContain("para el armado de tu espacio.");
  });

  it("speaks of both spaces for a full table", () => {
    const html = render({ standLabel: "B48 y B49", standCount: 2 });

    expect(html).toContain(
      "Tu reserva para los espacios <strong>B48 y B49</strong>",
    );
    expect(html).toContain("para el armado de tus espacios.");
    expect(html).not.toContain("tu espacio.");
  });
});
