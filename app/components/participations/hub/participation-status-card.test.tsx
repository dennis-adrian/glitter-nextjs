import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The waiting state renders a client child that refreshes the page at the
// opening instant.
const refreshMock = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: refreshMock }),
}));

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
    closedReservation: null,
    releasedReservation: null,
    reservationBlock: null,
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

  it("says the hour reservations open and that the screen updates itself", () => {
    // A past date on purpose: a future one would arm a real refresh timer.
    render(<ParticipationStatusCard hub={hub("waiting_for_reservations")} />);

    expect(
      screen.getByRole("heading", {
        name: "Las reservas abren el 31 de diciembre de 2025 a las 8:00 PM",
      }),
    ).toBeTruthy();
    expect(screen.getByText(/esta pantalla se actualiza sola/)).toBeTruthy();
    expect(
      screen.getByText(
        "En la app también podés deslizar hacia abajo para actualizar.",
      ),
    ).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("counts the stands left and links reserving", () => {
    render(<ParticipationStatusCard hub={hub("approved_enrollment")} />);

    expect(screen.getByText("Quedan 14 espacios de Ilustración.")).toBeTruthy();
    expect(href("Reservar stand")).toBe(
      "/profiles/3/festivals/9/reservations/new",
    );
    // The hero above the card is the one place the hub links the map from.
    expect(screen.queryByRole("link", { name: /mapa/i })).toBeNull();
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
    // The stand's pages moved to the shortcut grid; nothing pending, no button.
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("keeps one button for the first pending task of a confirmed stand and counts the rest", () => {
    render(
      <ParticipationStatusCard
        hub={hub("confirmed_reservation", {
          reservation: {
            stand: { label: "B", standNumber: 12 },
            participants: [],
            collaborators: [],
          } as unknown as ParticipationHub["reservation"],
          pending: [
            { key: "products", label: "Subir imágenes de tus productos", done: false, href: "/my_participations/submit_products" },
            { key: "team", label: "Agregar a tu equipo", done: false, href: "/my_participations/team", meta: "0 de 4" },
          ],
        })}
      />,
    );

    expect(href("Subir productos")).toBe("/my_participations/submit_products");
    expect(screen.queryByRole("link", { name: "Agregar a tu equipo" })).toBeNull();
    expect(href(/2 tareas pendientes · verlas en Inicio/)).toBe("/portal");
  });

  it("does not count a lone task the card's own button already does", () => {
    render(
      <ParticipationStatusCard
        hub={hub("pending_enrollment", {
          enrollment: null,
          pending: [
            { key: "enrollment", label: "Inscribirte al festival", done: false, href: "/profiles/3/festivals/9/terms" },
          ],
        })}
      />,
    );

    expect(screen.queryByText(/tareas? pendientes?/)).toBeNull();
  });

  it("says a reservation the team closed was cancelled, quotes the team and ends the steps", () => {
    render(
      <ParticipationStatusCard
        hub={hub("rejected_reservation", {
          closedReservation: {
            reservationId: 41,
            standLabel: "B12",
            reason: "No se recibió el pago dentro del plazo de 5 días.",
          },
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Tu reserva del stand B12 fue cancelada" }),
    ).toBeTruthy();
    expect(screen.getByText("Reserva cancelada")).toBeTruthy();
    expect(screen.queryByText(/rechazada/i)).toBeNull();
    expect(
      screen.getByText(/no vas a poder hacer otra reserva en Festicker 2026\.$/),
    ).toBeTruthy();
    expect(screen.getByText("Motivo del equipo")).toBeTruthy();
    expect(
      screen.getByText("No se recibió el pago dentro del plazo de 5 días."),
    ).toBeTruthy();
    expect(href("Escribinos")).toBe("mailto:soporte@productoraglitter.com");
    expect(href("Ver detalle")).toBe("/profiles/3/festivals/9/reservations/41");
    expect(
      screen.queryByRole("list", { name: "Pasos de tu participación" }),
    ).toBeNull();
  });

  it("does not add a period after a festival name that already ends a sentence", () => {
    render(
      <ParticipationStatusCard
        hub={hub("rejected_reservation", {
          festival: {
            id: 9,
            name: "Glitter ¡Feliz Cumple!",
            reservationsStartDate: new Date("2026-01-01T00:00:00Z"),
            festivalDates: [],
          } as unknown as ParticipationHub["festival"],
          closedReservation: { reservationId: 41, standLabel: "B12", reason: "x" },
        })}
      />,
    );

    expect(screen.getByText(/en Glitter ¡Feliz Cumple!$/)).toBeTruthy();
  });

  it("invites writing instead when the team left no reason", () => {
    render(
      <ParticipationStatusCard
        hub={hub("rejected_reservation", {
          closedReservation: { reservationId: 41, standLabel: "B12", reason: null },
        })}
      />,
    );

    expect(screen.getByText(/Si creés que hay un error, escribinos\./)).toBeTruthy();
    expect(screen.queryByText("Motivo del equipo")).toBeNull();
  });

  it("says a ban closes the edition and links the detail", () => {
    render(
      <ParticipationStatusCard
        hub={hub("reservations_blocked", {
          reservationBlock: { reason: "ban", eligibleAt: null },
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "No podés reservar en esta edición" }),
    ).toBeTruthy();
    expect(screen.getByText("Reservas no disponibles")).toBeTruthy();
    expect(href("Ver detalle")).toBe("/profiles/3/infractions");
    expect(screen.queryByRole("link", { name: "Reservar stand" })).toBeNull();
  });

  it("says when a delay lets them reserve, and keeps enrolling open", () => {
    render(
      <ParticipationStatusCard
        hub={hub("reservations_blocked", {
          enrollment: null,
          reservationBlock: {
            reason: "reservation_delay",
            eligibleAt: new Date("2026-11-10T16:00:00Z"),
          },
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /^Podés reservar desde el 10 de noviembre/ }),
    ).toBeTruthy();
    expect(screen.getByText("Reservas desde el 10 nov")).toBeTruthy();
    expect(screen.queryByText("No podés reservar en esta edición")).toBeNull();
    expect(href("Inscribirme")).toBe("/profiles/3/festivals/9/terms");
    expect(href("Ver detalle")).toBe("/profiles/3/infractions");
  });

  it("counts nothing once the participation ended", () => {
    render(
      <ParticipationStatusCard
        hub={hub("rejected_reservation", {
          closedReservation: { reservationId: 41, standLabel: "B12", reason: null },
          pending: [
            { key: "products", label: "Subir imágenes de tus productos", done: false, href: "/p" },
          ],
        })}
      />,
    );

    expect(screen.queryByText(/tareas? pendientes?/)).toBeNull();
  });

  it("does not count a payment the team is already reviewing", () => {
    render(
      <ParticipationStatusCard
        hub={hub("pending_payment_approval", {
          pending: [
            { key: "payment", label: "Pago de la reserva", done: false, href: "/invoices", meta: "en revisión", waiting: true },
          ],
        })}
      />,
    );

    expect(screen.queryByText(/tareas? pendientes?/)).toBeNull();
  });

  it("notes a stand released earlier and offers a new reservation", () => {
    render(
      <ParticipationStatusCard
        hub={hub("approved_enrollment", {
          releasedReservation: {
            reservationId: 40,
            standLabel: "B12",
            releasedAt: new Date("2026-10-28T16:00:00Z"),
          },
        })}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Podés hacer una nueva reserva" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Liberaste el stand B12 el 28 oct. Los créditos que usaste no se devuelven.",
      ),
    ).toBeTruthy();
    expect(href("Reservar stand")).toBe("/profiles/3/festivals/9/reservations/new");
  });
});
