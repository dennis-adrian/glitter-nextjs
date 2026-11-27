import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BaseProfile } from "@/app/api/users/definitions";
import type { FestivalActivityWithDetailsAndParticipants } from "@/app/lib/festivals/definitions";
import EnrollRedirectButton from "./enroll-redirect-button";

const mocks = vi.hoisted(() => ({ acceptInvite: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
}));
vi.mock("@/app/lib/festival_activites/actions", () => ({
  enrollFromWaitlistInvitation: mocks.acceptInvite,
  enrollInActivity: vi.fn(),
  joinActivityWaitlist: vi.fn(),
  leaveActivityWaitlist: vi.fn(),
  deleteFestivalActivityParticipantProof: vi.fn(),
}));
vi.mock("./upload-sticker-design-modal", () => ({ default: () => null }));
vi.mock("./coupon-book-proof-modal", () => ({ default: () => null }));

const profile = {
  id: 101,
  role: "user",
  category: "illustration",
} as BaseProfile;
const now = new Date("2026-09-21T18:00:00Z");
function buildActivity(
  registrationClosed: boolean,
): FestivalActivityWithDetailsAndParticipants {
  return {
    id: 42,
    festivalId: 7,
    name: "Cuponera",
    type: "coupon_book",
    description: null,
    promotionalArtUrl: null,
    visitorsDescription: null,
    activityPrizeUrl: null,
    allowsVoting: false,
    votingStartDate: null,
    votingEndDate: null,
    registrationStartDate: new Date("2026-09-19T18:00:00Z"),
    registrationEndDate: new Date(
      registrationClosed ? "2026-09-20T18:00:00Z" : "2026-09-25T18:00:00Z",
    ),
    proofType: "text",
    proofUploadLimitDate: null,
    accessLevel: "public",
    waitlistWindowMinutes: 60,
    createdAt: now,
    updatedAt: now,
    details: [
      {
        id: 84,
        activityId: 42,
        category: "illustration",
        description: null,
        imageUrl: null,
        couponBookHeaderImageUrl: null,
        participationLimit: 1,
        participants: [],
        votes: [],
        createdAt: now,
        updatedAt: now,
      },
    ],
    waitlistEntries: [
      {
        id: 9,
        activityId: 42,
        userId: profile.id,
        user: profile,
        position: 1,
        notifiedAt: now,
        expiresAt: new Date("2026-09-22T18:00:00Z"),
        notifiedForDetailId: 84,
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("waitlist invitation with an available spot", () => {
  it.each([false, true])(
    "lets the user claim the invitation (general registration closed: %s)",
    async (closed) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(now);
      mocks.acceptInvite.mockResolvedValue({
        success: true,
        message: "Inscripción confirmada",
      });
      render(
        <EnrollRedirectButton
          currentProfile={profile}
          forProfile={profile}
          festivalId={7}
          activity={buildActivity(closed)}
        />,
      );

      expect(screen.getByText("¡Tenés un cupo disponible!")).toBeTruthy();
      fireEvent.click(
        screen.getByRole("button", { name: "Inscribirme ahora" }),
      );
      await waitFor(() =>
        expect(mocks.acceptInvite).toHaveBeenCalledWith(101, 9, 7),
      );
      await waitFor(() =>
        expect(mocks.push).toHaveBeenCalledWith(
          "/profiles/101/festivals/7/activity/enroll/success",
        ),
      );
    },
  );

  it("does not offer the invitation action at its expiration time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-22T18:00:00Z"));
    render(
      <EnrollRedirectButton
        currentProfile={profile}
        forProfile={profile}
        festivalId={7}
        activity={buildActivity(true)}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Inscribirme ahora" }),
    ).toBeNull();
    expect(screen.queryByText("¡Tenés un cupo disponible!")).toBeNull();
  });
});

describe("picking the variant to enroll in", () => {
  function twoVariants(fullForViewer: [boolean, boolean]) {
    const activity = buildActivity(false);
    const [variant] = activity.details;
    // Both variants look empty; only the server knows their seats are held.
    activity.details = [
      { ...variant, id: 84, fullForViewer: fullForViewer[0] },
      {
        ...variant,
        id: 85,
        participationLimit: 2,
        fullForViewer: fullForViewer[1],
      },
    ];
    return activity;
  }

  it("sends the first variant with a seat open to the profile, not one an invitation holds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const { enrollInActivity } =
      await import("@/app/lib/festival_activites/actions");
    // The consent checkbox measures itself, which jsdom cannot.
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    vi.mocked(enrollInActivity).mockResolvedValue({
      success: false,
      message: "x",
    });
    const activity = { ...twoVariants([true, false]), waitlistEntries: [] };
    render(
      <EnrollRedirectButton
        currentProfile={profile}
        forProfile={profile}
        festivalId={7}
        activity={activity}
      />,
    );

    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Inscribirme" }));

    await waitFor(() => expect(enrollInActivity).toHaveBeenCalled());
    expect(vi.mocked(enrollInActivity).mock.calls[0][2].id).toBe(85);
  });

  it("shows a waiting profile its place when every seat is held for others", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
    const activity = twoVariants([true, true]);
    activity.waitlistEntries = [
      {
        ...activity.waitlistEntries[0],
        position: 3,
        notifiedAt: null,
        expiresAt: null,
        notifiedForDetailId: null,
      },
    ];
    render(
      <EnrollRedirectButton
        currentProfile={profile}
        forProfile={profile}
        festivalId={7}
        activity={activity}
      />,
    );

    expect(screen.getByText("Estás en la lista de espera")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Inscribirme" })).toBeNull();
  });
});
