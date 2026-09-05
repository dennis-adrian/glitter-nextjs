// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/image", () => ({
  default: (p: Record<string, unknown>) => (
    // `fill` is a Next-only boolean prop; forwarding it to <img> warns.
    <img {...(p as { src: string; alt: string })} fill={undefined} />
  ),
}));

import ReservationCard from "@/app/components/participant_dashboard/reservation-card";

const PROFILE = { id: 3 } as never;

function festival(artwork: Partial<Record<string, string | null>> = {}) {
  return {
    id: 7,
    name: "Glitter ¡Feliz Cumple!",
    reservationsStartDate: new Date("2020-01-01"),
    festivalDates: [{ startDate: new Date("2026-09-24") }],
    posterUrl: null,
    festivalBannerUrl: null,
    thumbnailUrl: null,
    ...artwork,
  } as never;
}

function participation(reservationId: number) {
  return {
    id: reservationId,
    reservation: { id: reservationId, status: "pending", createdAt: new Date() },
  } as never;
}

const ACCEPTED_ENROLLMENT = { status: "accepted" } as never;

function renderCard(options: {
  festival: ReturnType<typeof festival>;
  participations?: ReturnType<typeof participation>[];
  outstandingInvoiceCount?: number;
}) {
  const participations = options.participations ?? [participation(42)];
  return render(
    <ReservationCard
      profile={PROFILE}
      activeFestival={options.festival}
      activeParticipations={participations}
      profileEnrollment={ACCEPTED_ENROLLMENT}
      outstandingInvoiceCount={options.outstandingInvoiceCount ?? 1}
      reservationCount={participations.length}
    />,
  );
}

/**
 * The card used to run its own `aspect-3/1` strip off `thumbnailUrl` alone, so
 * a festival with a poster and no thumbnail showed a bare orange gradient. It
 * now resolves artwork the way the rest of the app does.
 */
describe("festival artwork", () => {
  afterEach(cleanup);

  it("prefers the poster", () => {
    renderCard({
      festival: festival({
        posterUrl: "/poster.png",
        festivalBannerUrl: "/banner.png",
        thumbnailUrl: "/thumb.png",
      }),
    });

    const art = screen.getByAltText(/afiche de glitter/i) as HTMLImageElement;
    expect(art.src).toContain("/poster.png");
  });

  it("falls back to the banner, then the thumbnail", () => {
    const { unmount } = renderCard({
      festival: festival({
        festivalBannerUrl: "/banner.png",
        thumbnailUrl: "/thumb.png",
      }),
    });
    expect(
      (screen.getByAltText(/afiche de glitter/i) as HTMLImageElement).src,
    ).toContain("/banner.png");
    unmount();

    renderCard({ festival: festival({ thumbnailUrl: "/thumb.png" }) });
    expect(
      (screen.getByAltText(/afiche de glitter/i) as HTMLImageElement).src,
    ).toContain("/thumb.png");
  });

  it("keeps the same footprint when the festival has no artwork at all", () => {
    renderCard({ festival: festival() });

    expect(screen.queryByAltText(/afiche de/i)).toBeNull();
    expect(screen.getByRole("img", { name: /identidad visual/i })).toBeTruthy();
  });
});

/**
 * The card is where a participant meets their reservation, so it is the natural
 * way into the detail page — but only when "their reservation" names one thing.
 */
describe("the way through to the reservation detail", () => {
  afterEach(cleanup);

  it("links to the reservation while a payment is still owed", () => {
    renderCard({ festival: festival(), outstandingInvoiceCount: 1 });

    // Paying keeps the primary button; the detail page gets its own.
    expect(screen.getByRole("link", { name: /completar el pago/i })).toBeTruthy();
    const detail = screen.getByRole("link", {
      name: /ver el detalle de mi reserva/i,
    });
    expect(detail.getAttribute("href")).toBe(
      "/profiles/3/festivals/7/reservations/42",
    );
  });

  it("stays on the list when there is more than one reservation", () => {
    renderCard({
      festival: festival(),
      participations: [participation(42), participation(43)],
    });

    // Two reservations have no single detail page to point at.
    expect(
      screen.queryByRole("link", { name: /ver el detalle de mi reserva/i }),
    ).toBeNull();
  });
});
