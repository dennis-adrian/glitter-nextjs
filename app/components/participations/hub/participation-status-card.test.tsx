import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import ParticipationStatusCard from "@/app/components/participations/hub/participation-status-card";
import type { ParticipationHub } from "@/app/lib/participations/hub";
import {
  buildSteps,
  type HubStatus,
} from "@/app/lib/participations/hub-status";

afterEach(cleanup);

function hub(
  status: HubStatus,
  overrides: Partial<ParticipationHub> = {},
): ParticipationHub {
  const isConfirmed = status === "confirmed_reservation";
  return {
    profile: { id: 3, category: "illustration" },
    festival: {
      id: 9,
      name: "Festicker 2026",
      reservationsStartDate: new Date("2026-01-01T00:00:00Z"),
      festivalDates: [],
    },
    status,
    cardStatus:
      status === "no_stands_available" ? "approved_enrollment" : status,
    steps: buildSteps({
      isGastronomy: false,
      enrollmentStatus: "accepted",
      hasReservation: isConfirmed,
      isConfirmed,
    }),
    pending: [],
    links: {
      terms: "/profiles/3/festivals/9/terms",
      reserve: "/profiles/3/festivals/9/reservations/new",
      invoices: "/profiles/3/festivals/9/invoices",
      products: "/my_participations/submit_products",
      team: "/my_participations/team",
      reservation: "/profiles/3/festivals/9/reservations/41",
      map: "/festivals/9#mapa",
      publicTerms: "/festivals/9/terms",
    },
    enrollment: { status: "accepted" },
    isGastronomy: false,
    isConfirmed,
    hasReservation: isConfirmed,
    availableStands: 14,
    outstandingInvoiceCount: 0,
    reservationCount: isConfirmed ? 1 : 0,
    reservation: null,
    teamCount: 0,
    activities: [],
    sessions: [],
    activeParticipations: [],
    ...overrides,
  } as unknown as ParticipationHub;
}

function href(name: string | RegExp) {
  return screen.getByRole("link", { name }).getAttribute("href");
}

describe("ParticipationStatusCard", () => {
  it("invites someone not enrolled to enroll through the terms", () => {
    render(
      <ParticipationStatusCard
        hub={hub("pending_enrollment", { enrollment: null })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Inscribite a Festicker 2026" }),
    ).toBeTruthy();
    expect(href("Inscribirme")).toBe("/profiles/3/festivals/9/terms");
  });

  it("counts the stands left and links reserving", () => {
    render(<ParticipationStatusCard hub={hub("approved_enrollment")} />);

    expect(screen.getByText("Quedan 14 espacios de Ilustración.")).toBeTruthy();
    expect(href("Reservar stand")).toBe(
      "/profiles/3/festivals/9/reservations/new",
    );
    expect(href("Mapa")).toBe("/festivals/9#mapa");
  });

  it("says the category ran out instead", () => {
    render(
      <ParticipationStatusCard
        hub={hub("no_stands_available", { availableStands: 0 })}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Los espacios de Ilustración se agotaron",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Reservar stand" })).toBeNull();
  });

  it("offers nothing to do while gastronomy's enrollment is reviewed", () => {
    render(
      <ParticipationStatusCard
        hub={hub("enrollment_pending_approval", {
          isGastronomy: true,
          enrollment: { status: "pending" } as ParticipationHub["enrollment"],
        })}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "El equipo está revisando tu inscripción",
      }),
    ).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("marks only the completed steps", () => {
    render(<ParticipationStatusCard hub={hub("approved_enrollment")} />);

    const steps = screen
      .getByRole("list", { name: "Pasos de tu participación" })
      .querySelectorAll("li");
    expect([...steps].map((step) => step.textContent)).toEqual([
      "Inscripción (completado)",
      "Reserva (pendiente)",
      "Pago (pendiente)",
    ]);
  });

  it("becomes the stand once the reservation is confirmed", () => {
    render(
      <ParticipationStatusCard
        hub={hub("confirmed_reservation", {
          reservation: {
            stand: { label: "B", standNumber: 12 },
            participants: [
              { user: { id: 3, displayName: "Camila", imageUrl: null } },
              { user: { id: 8, displayName: "Juan Pérez", imageUrl: null } },
            ],
            collaborators: [],
          } as unknown as ParticipationHub["reservation"],
        })}
      />,
    );

    expect(screen.getByText("Stand B12 · Ilustración")).toBeTruthy();
    expect(screen.getByText(/Compartido con Juan Pérez/)).toBeTruthy();
    expect(
      screen.queryByRole("list", { name: "Pasos de tu participación" }),
    ).toBeNull();
    expect(href("Reserva")).toBe("/profiles/3/festivals/9/reservations/41");
    expect(href("Productos")).toBe("/my_participations/submit_products");
  });
});
