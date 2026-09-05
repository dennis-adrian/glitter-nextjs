import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const fetchReservationMock = vi.hoisted(() => vi.fn());
const currentProfileMock = vi.hoisted(() => vi.fn());
const releaseOfferMock = vi.hoisted(() => vi.fn());
const featureFlagMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/reservations/queries", () => ({
  fetchReservationForParticipant: fetchReservationMock,
}));
vi.mock("@/app/lib/reservations/release-queries", () => ({
  fetchReleaseOffer: releaseOfferMock,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: featureFlagMock,
}));
// The button is a client component reaching a "use server" module.
vi.mock("@/app/lib/reservations/release-actions", () => ({
  releaseReservationAction: vi.fn(),
}));
vi.mock("@/app/lib/credits/purchase-actions", () => ({
  createFeatureCreditTopUpAction: vi.fn(),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  protectRoute: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  // The release button is a client component rendered inside this tree.
  useRouter: () => ({ refresh: vi.fn() }),
}));

import ReservationDetailPage from "@/app/components/pages/profiles/festivals/reservation-detail";

const OWNER = { id: 3, displayName: "Ana Ilustra" };
const PARTNER = { id: 5, displayName: "Carla Dibuja" };

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    festivalId: 7,
    status: "pending",
    ownerUserId: OWNER.id,
    festival: { id: 7, name: "Glitter ¡Feliz Cumple!" },
    stand: {
      label: "B",
      standNumber: 48,
      standCategory: "illustration",
      festivalSector: { name: "Sector Ilustración" },
    },
    members: [
      {
        standId: 60,
        position: 0,
        releasedAt: null,
        stand: { label: "B", standNumber: 48, standCategory: "illustration" },
      },
    ],
    participants: [{ id: 1, userId: OWNER.id, user: OWNER }],
    invoices: [
      {
        id: 9,
        status: "pending",
        amount: 370,
        dueAt: new Date("2026-10-01T18:00:00Z"),
      },
    ],
    ...overrides,
  };
}

const NO_RELEASE = {
  offered: false,
  creditPrice: 0,
  spendableBalance: 0,
  shortfall: 0,
};

async function render(
  data: ReturnType<typeof reservation> | null,
  viewer: { id: number; displayName: string } = OWNER,
  options: { release?: typeof NO_RELEASE; creditsEnabled?: boolean } = {},
) {
  fetchReservationMock.mockResolvedValue(data);
  currentProfileMock.mockResolvedValue(viewer);
  releaseOfferMock.mockResolvedValue(options.release ?? NO_RELEASE);
  featureFlagMock.mockResolvedValue(options.creditsEnabled ?? true);
  const element = await ReservationDetailPage({
    profileId: viewer.id,
    festivalId: 7,
    reservationId: 42,
  });
  return renderToStaticMarkup(element);
}

describe("ReservationDetailPage", () => {
  afterEach(() => vi.clearAllMocks());

  it("shows what was booked and where it stands", async () => {
    const html = await render(reservation());

    expect(html).toContain("B48");
    expect(html).toContain("Sector Ilustración");
    expect(html).toContain("Pendiente de pago");
    expect(html).toContain("Bs370");
  });

  it("names both halves of a full table", async () => {
    const html = await render(
      reservation({
        members: [
          {
            standId: 60,
            position: 0,
            releasedAt: null,
            stand: {
              label: "B",
              standNumber: 48,
              standCategory: "illustration",
            },
          },
          {
            standId: 61,
            position: 1,
            releasedAt: null,
            stand: {
              label: "B",
              standNumber: 49,
              standCategory: "illustration",
            },
          },
        ],
      }),
    );

    expect(html).toContain("B48 y B49");
    expect(html).toContain("mesa completa");
    expect(html).toContain("60cm x 240cm");
  });

  /** Owner pays, partner sees (PRD §14). */
  it("offers the payment to the owner", async () => {
    const html = await render(reservation());

    expect(html).toContain("Completar el pago");
    expect(html).toContain("Acciones disponibles");
  });

  it("tells a partner who pays, and offers them nothing to press", async () => {
    const html = await render(
      reservation({
        participants: [
          { id: 1, userId: OWNER.id, user: OWNER },
          { id: 2, userId: PARTNER.id, user: PARTNER },
        ],
      }),
      PARTNER,
    );

    expect(html).toContain("El pago corre por cuenta de Ana Ilustra");
    expect(html).not.toContain("Completar el pago");
    // The section is shown but says who it belongs to: a partner who saw
    // nothing would wonder whether it was broken or whether they had missed
    // a deadline.
    expect(html).toContain("Acciones disponibles");
    expect(html).toContain("Solo el titular puede hacer cambios");
  });

  it("stops asking for payment once the reservation is released", async () => {
    const html = await render(
      reservation({
        status: "released",
        invoices: [{ id: 9, status: "cancelled", amount: 370, dueAt: null }],
      }),
    );

    expect(html).toContain("Liberada");
    expect(html).toContain("volvió al mapa");
    expect(html).not.toContain("Completar el pago");
  });

  it("says a closed reservation cannot be rebooked", async () => {
    const html = await render(
      reservation({
        status: "rejected",
        invoices: [{ id: 9, status: "cancelled", amount: 370, dueAt: null }],
      }),
    );

    expect(html).toContain("Cerrada");
    expect(html).toContain("No vas a poder hacer otra reserva");
  });

  describe("release", () => {
    const OFFERED = {
      offered: true,
      creditPrice: 40,
      spendableBalance: 40,
      shortfall: 0,
    };

    it("offers the release when the owner can afford it", async () => {
      const html = await render(reservation(), OWNER, { release: OFFERED });

      expect(html).toContain("Liberar reserva");
      expect(html).toContain("40 créditos");
    });

    /**
     * Credits are the only way to fund a release, so an inert button beside a
     * price would leave someone hunting for the way forward. The purchase
     * takes its place.
     */
    it("sells the shortfall instead when the balance is short", async () => {
      const html = await render(reservation(), OWNER, {
        release: { ...OFFERED, spendableBalance: 10, shortfall: 30 },
      });

      expect(html).toContain("Te faltan");
      expect(html).toContain("30 créditos");
    });

    /**
     * The offer is already withheld for a non-pending reservation by
     * `fetchReleaseOffer`; this is the page holding up its end.
     */
    it("shows nothing when the offer is withheld", async () => {
      const html = await render(reservation({ status: "accepted" }));

      expect(html).not.toContain("Liberar reserva");
      expect(html).toContain("Por ahora no hay acciones disponibles");
    });

    it("withholds the release while credits are hidden from participants", async () => {
      const html = await render(reservation(), OWNER, {
        release: OFFERED,
        creditsEnabled: false,
      });

      expect(html).not.toContain("Liberar reserva");
    });
  });

  /**
   * Not-found rather than forbidden: the fetcher already refuses a reservation
   * the viewer is not on, and confirming that an id exists would leak which
   * ones are real.
   */
  it("404s when the viewer is not on the reservation", async () => {
    await expect(render(null)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s when the reservation belongs to another festival", async () => {
    await expect(render(reservation({ festivalId: 99 }))).rejects.toThrow(
      "NEXT_NOT_FOUND",
    );
  });
});
