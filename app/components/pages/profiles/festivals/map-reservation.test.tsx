import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const currentProfileMock = vi.hoisted(() => vi.fn());
const protectRouteMock = vi.hoisted(() => vi.fn());
const festivalSnapshotMock = vi.hoisted(() => vi.fn());
const targetProfileMock = vi.hoisted(() => vi.fn());
const mapDtoMock = vi.hoisted(() => vi.fn());
const denialMock = vi.hoisted(() => vi.fn());
const fullTableOfferMock = vi.hoisted(() => vi.fn());
const featureEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentBaseProfile: currentProfileMock,
  protectRoute: protectRouteMock,
}));
vi.mock("@/app/lib/reservations/map-queries", () => ({
  fetchSelfServiceFestivalSnapshot: festivalSnapshotMock,
  fetchSelfServiceTargetProfile: targetProfileMock,
  fetchFestivalReservationMapDto: mapDtoMock,
}));
vi.mock("@/app/lib/reservations/entry", () => ({
  getSelfServicePageDenial: denialMock,
}));
vi.mock("@/app/lib/reservations/full-table-queries", () => ({
  fetchFullTableOffer: fullTableOfferMock,
}));
vi.mock("@/app/lib/feature_flags/helpers", () => ({
  isFeatureEnabled: featureEnabledMock,
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

// The children are stubbed: these tests are about what the page decides to
// fetch and show, not how each piece renders.
vi.mock("@/app/components/festivals/reservations/full-table-panel", () => ({
  default: (props: { creditsEnabled: boolean }) => (
    <div
      data-testid="full-table-panel"
      data-credits={String(props.creditsEnabled)}
    />
  ),
}));
vi.mock("@/app/components/festivals/reservations/map-tabs-client", () => ({
  default: () => <div data-testid="map-tabs" />,
}));
vi.mock(
  "@/app/components/pages/profiles/festivals/reservation-not-allowed",
  () => ({
    default: (props: { policyCode: string }) => (
      <div data-testid="not-allowed" data-code={props.policyCode} />
    ),
  }),
);
vi.mock("@/app/components/festival-terms/reacceptance-required", () => ({
  default: () => <div data-testid="terms-reacceptance" />,
}));

import MapReservationPage from "@/app/components/pages/profiles/festivals/map-reservation";

const PARTICIPANT = { id: 3, role: "user" };
const ADMIN = { id: 1, role: "admin" };
const FESTIVAL = {
  id: 7,
  status: "active",
  reservationsStartDate: new Date("2026-12-01T15:00:00Z"),
  participantTermsEnabled: true,
};
const TARGET = { id: 3, status: "verified", category: "illustration" };
const OFFER = { offered: true, active: false, creditPrice: 120 };
const MAP = { festivalId: 7, sectors: [] };

async function renderPage() {
  return renderToStaticMarkup(
    await MapReservationPage({ profileId: 3, festivalId: 7 }),
  );
}

const PANEL = 'data-testid="full-table-panel"';

describe("MapReservationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentProfileMock.mockResolvedValue(PARTICIPANT);
    protectRouteMock.mockResolvedValue(undefined);
    festivalSnapshotMock.mockResolvedValue(FESTIVAL);
    targetProfileMock.mockResolvedValue(TARGET);
    mapDtoMock.mockResolvedValue(MAP);
    denialMock.mockResolvedValue(null);
    fullTableOfferMock.mockResolvedValue(OFFER);
    featureEnabledMock.mockResolvedValue(true);
  });

  it("shows the offer under the countdown when the opening would admit the participant", async () => {
    denialMock
      .mockResolvedValueOnce({ code: "RESERVATIONS_NOT_OPEN" })
      .mockResolvedValueOnce(null);

    const html = await renderPage();

    expect(html).toContain(PANEL);
    expect(html).toContain('data-code="RESERVATIONS_NOT_OPEN"');
    expect(denialMock).toHaveBeenCalledTimes(2);
    expect(denialMock.mock.calls[1][0]).toMatchObject({
      now: FESTIVAL.reservationsStartDate,
    });
    expect(denialMock.mock.calls[0][0]).not.toHaveProperty("now");
  });

  it("hides the offer under the countdown when the opening would still deny", async () => {
    denialMock
      .mockResolvedValueOnce({ code: "RESERVATIONS_NOT_OPEN" })
      .mockResolvedValueOnce({ code: "NOT_ENROLLED" });

    const html = await renderPage();

    expect(html).not.toContain(PANEL);
    // The countdown is still what the participant sees.
    expect(html).toContain('data-code="RESERVATIONS_NOT_OPEN"');
  });

  it("never offers an admin's credits on someone else's countdown", async () => {
    currentProfileMock.mockResolvedValue(ADMIN);
    denialMock.mockResolvedValue({ code: "RESERVATIONS_NOT_OPEN" });

    const html = await renderPage();

    expect(html).not.toContain(PANEL);
    expect(fullTableOfferMock).not.toHaveBeenCalled();
    expect(denialMock).toHaveBeenCalledTimes(1);
  });

  it("fetches the offer and the flag once and quotes the price when credits are on", async () => {
    const html = await renderPage();

    expect(html).toContain(PANEL);
    expect(html).toContain('data-testid="map-tabs"');
    expect(fullTableOfferMock).toHaveBeenCalledTimes(1);
    expect(featureEnabledMock).toHaveBeenCalledTimes(1);
    const { activationOffer } = mapDtoMock.mock.calls[0][0];
    await expect(activationOffer).resolves.toEqual(OFFER);
  });

  it("does not quote the activation price when credits are hidden", async () => {
    featureEnabledMock.mockResolvedValue(false);

    const html = await renderPage();

    expect(fullTableOfferMock).toHaveBeenCalledTimes(1);
    expect(featureEnabledMock).toHaveBeenCalledTimes(1);
    const { activationOffer } = mapDtoMock.mock.calls[0][0];
    await expect(activationOffer).resolves.toBeNull();
    // The panel itself still renders, told that credits are off.
    expect(html).toContain(PANEL);
    expect(html).toContain('data-credits="false"');
  });

  describe("when the session check redirects", () => {
    const unhandled = vi.fn();
    beforeEach(() => {
      process.on("unhandledRejection", unhandled);
    });
    afterEach(() => {
      process.off("unhandledRejection", unhandled);
      unhandled.mockReset();
    });

    it("rejects with the redirect and leaves no unhandled rejection behind", async () => {
      const redirect = Object.assign(new Error("NEXT_REDIRECT"), {
        digest: "NEXT_REDIRECT;replace;/sign_in;307;",
      });
      protectRouteMock.mockRejectedValue(redirect);
      festivalSnapshotMock.mockRejectedValue(new Error("connection reset"));

      await expect(renderPage()).rejects.toBe(redirect);
      // Both id-keyed fetches were started before the check.
      expect(festivalSnapshotMock).toHaveBeenCalledTimes(1);
      expect(targetProfileMock).toHaveBeenCalledTimes(1);

      await new Promise((resolve) => setImmediate(resolve));
      await new Promise((resolve) => setImmediate(resolve));

      expect(unhandled).not.toHaveBeenCalled();
    });
  });
});
