// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());
const currentProfileMock = vi.hoisted(() => vi.fn());
const targetProfileMock = vi.hoisted(() => vi.fn());
const featureEnabledMock = vi.hoisted(() => vi.fn());
const fullTableOfferMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: redirectMock,
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  // The purchase button is a client component inside this tree.
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: currentProfileMock,
  protectRoute: vi.fn(),
}));
vi.mock("@/app/lib/reservations/map-queries", () => ({
  fetchSelfServiceTargetProfile: targetProfileMock,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: featureEnabledMock,
}));
vi.mock("@/app/lib/reservations/full-table-queries", () => ({
  fetchFullTableOffer: fullTableOfferMock,
}));
vi.mock("@/app/lib/credits/purchase-actions", () => ({
  createFeatureCreditTopUpAction: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import CreditsIntroduction from "@/app/components/festivals/reservations/credits-introduction";

const PARTICIPANT = { id: 7, role: "user" };

function offer(overrides: Record<string, unknown> = {}) {
  return {
    offered: true,
    active: false,
    creditPrice: 120,
    spendableBalance: 0,
    shortfall: 120,
    hasCompleteTable: true,
    blockedReason: "insufficient_credits",
    ...overrides,
  };
}

async function renderIntro() {
  // An async server component: render what it resolves to.
  return render(await CreditsIntroduction({ profileId: 7, festivalId: 1 }));
}

const BUY = /Comprar .* en créditos/;

describe("CreditsIntroduction", () => {
  beforeEach(() => {
    redirectMock.mockReset();
    currentProfileMock.mockResolvedValue(PARTICIPANT);
    targetProfileMock.mockResolvedValue({
      id: 7,
      category: "entrepreneurship",
    });
    featureEnabledMock.mockResolvedValue(true);
    fullTableOfferMock.mockResolvedValue(offer());
  });
  afterEach(cleanup);

  /**
   * The screen exists to settle the money question before the map (PRD §7.2).
   * It used to quote the price and offer only "Continuar", sending someone with
   * no credits off to find the purchase on the next screen — which is the one
   * thing this screen is for.
   */
  it("offers the purchase to a participant who cannot yet afford the table", async () => {
    await renderIntro();

    expect(screen.getByText(BUY)).toBeTruthy();
    // The configured price, quoted before the purchase is offered.
    expect(screen.getAllByText(/Bs120\.00/).length).toBeGreaterThan(0);
    expect(screen.getByText("Ahora no, seguir al plano")).toBeTruthy();
  });

  /**
   * The screen answers one question — what turning the feature on costs. What a
   * full table actually is lives behind a link, not in front of someone
   * deciding whether to pay.
   */
  it("keeps to the price and links the explanation out", async () => {
    await renderIntro();

    expect(
      screen.getByRole("link", {
        name: /Qué es una mesa completa y cómo funcionan los créditos/,
      }),
    ).toBeTruthy();
    // The long explanation that used to sit on this page is gone.
    expect(screen.queryByText("Media mesa y mesa completa")).toBeNull();
    expect(screen.queryByText("Qué comprás exactamente")).toBeNull();
  });

  it("still states that activating guarantees nothing", async () => {
    // A condition of the purchase, not an explanation of the product (PRD §7.3).
    await renderIntro();

    expect(screen.getByText(/No reserva ni garantiza/)).toBeTruthy();
  });

  it("just continues when the balance already covers the price", async () => {
    fullTableOfferMock.mockResolvedValue(
      offer({ spendableBalance: 200, shortfall: 0, blockedReason: null }),
    );

    await renderIntro();

    expect(screen.queryByText(BUY)).toBeNull();
    expect(screen.getByText("Continuar")).toBeTruthy();
  });

  it("does not sell to an admin looking at someone else's enrolment", async () => {
    // The purchase spends the session's own credits, never the viewed profile's.
    currentProfileMock.mockResolvedValue({ id: 99, role: "admin" });

    await renderIntro();

    expect(screen.queryByText(BUY)).toBeNull();
  });

  it("steps aside when the festival has no full table to offer", async () => {
    fullTableOfferMock.mockResolvedValue(offer({ offered: false }));

    await renderIntro().catch(() => undefined);

    expect(redirectMock).toHaveBeenCalledWith(
      "/profiles/7/festivals/1/reservations/new",
    );
  });

  it("steps aside while credits are still hidden", async () => {
    featureEnabledMock.mockResolvedValue(false);

    await renderIntro().catch(() => undefined);

    expect(redirectMock).toHaveBeenCalledWith(
      "/profiles/7/festivals/1/reservations/new",
    );
  });

  it("steps aside for a category that cannot take a full table", async () => {
    targetProfileMock.mockResolvedValue({ id: 7, category: "gastronomy" });

    await renderIntro().catch(() => undefined);

    expect(redirectMock).toHaveBeenCalledWith(
      "/profiles/7/festivals/1/reservations/new",
    );
  });
});
