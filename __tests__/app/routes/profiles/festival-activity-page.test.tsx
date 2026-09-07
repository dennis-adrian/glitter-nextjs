import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { DateTime } from "luxon";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BaseProfile } from "@/app/api/users/definitions";
import FestivalActivityPage from "@/app/(routes)/profiles/[profileId]/festivals/[festivalId]/activity/[activityId]/page";
import type {
  FestivalActivity,
  FestivalActivityWithDetailsAndParticipants,
} from "@/app/lib/festivals/definitions";

const mocks = vi.hoisted(() => ({
  fetchFestivalActivity: vi.fn(),
  fetchFestivalParticipants: vi.fn(),
  fetchUserProfileById: vi.fn(),
  getCurrentUserProfile: vi.fn(),
  protectRoute: vi.fn(),
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  useRouter: () => ({
    push: mocks.routerPush,
    refresh: mocks.routerRefresh,
  }),
}));

vi.mock("next/image", () => ({
  default: ({
    fill: _fill,
    blurDataURL: _blurDataURL,
    placeholder: _placeholder,
    ...props
  }: React.ComponentProps<"img"> & {
    fill?: boolean;
    blurDataURL?: string;
    placeholder?: string;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img {...props} />
  ),
}));

vi.mock(
  "@/app/components/pages/festival_activities/variant-images-display",
  () => ({ default: () => null }),
);

vi.mock(
  "@/app/components/pages/festival_activities/best-stand-activity",
  async () => {
    const { default: EnrollBestStandForm } =
      await import("@/app/components/festivals/festival_activities/enroll-best-stand-form");

    return {
      default: ({
        activity,
        forProfile,
      }: {
        activity: FestivalActivityWithDetailsAndParticipants;
        forProfile: BaseProfile;
      }) => (
        <div>
          <h1>{activity.name}</h1>
          <EnrollBestStandForm
            forProfile={forProfile}
            activity={activity}
            festivalParticipants={[]}
            activityVariantForProfile={activity.details[0]}
          />
        </div>
      ),
    };
  },
);

vi.mock("@/app/api/users/actions", () => ({
  fetchUserProfileById: mocks.fetchUserProfileById,
}));

vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: mocks.getCurrentUserProfile,
  protectRoute: mocks.protectRoute,
}));

vi.mock("@/app/lib/festival_activites/actions", () => ({
  deleteFestivalActivityParticipantProof: vi.fn(),
  enrollFromWaitlistInvitation: vi.fn(),
  enrollInActivity: vi.fn(),
  enrollInBestStandActivity: vi.fn(),
  fetchFestivalActivity: mocks.fetchFestivalActivity,
  joinActivityWaitlist: vi.fn(),
  leaveActivityWaitlist: vi.fn(),
}));

vi.mock("@/app/lib/festivals/actions", () => ({
  fetchFestivalParticipants: mocks.fetchFestivalParticipants,
}));

vi.mock(
  "@/app/components/festivals/festival_activities/upload-sticker-design-modal",
  () => ({ default: () => null }),
);

vi.mock(
  "@/app/components/festivals/festival_activities/coupon-book-proof-modal",
  () => ({ default: () => null }),
);

vi.mock(
  "@/app/components/festivals/festival_activities/remove-proof-image-button",
  () => ({ default: () => null }),
);

const CONSENT_LABEL =
  "Confirmo que leí y estoy de acuerdo con las condiciones de la actividad.";
const CONSENT_DESCRIPTION =
  "Entiendo que incumplir las condiciones de la actividad, podría excluirme de futuros eventos o actividades.";

const ACTIVITY_TYPES = [
  ["stamp_passport", "Carrera de Sellos"],
  ["sticker_print", "Sticker Print"],
  ["best_stand", "Stand Icónico"],
  ["festival_sticker", "Sticker del Festival"],
  ["coupon_book", "Cuponera de Descuentos"],
  ["sticker_hunt", "Cacería de Stickers"],
] as const satisfies ReadonlyArray<readonly [FestivalActivity["type"], string]>;

const STANDARD_ENROLLMENT_TYPES = [
  ["stamp_passport", "Carrera de Sellos"],
  ["festival_sticker", "Sticker del Festival"],
  ["coupon_book", "Cuponera de Descuentos"],
  ["sticker_hunt", "Cacería de Stickers"],
] as const satisfies ReadonlyArray<readonly [FestivalActivity["type"], string]>;

const currentProfile = {
  id: 101,
  role: "artist",
  category: "illustration",
} as BaseProfile;

function buildOpenActivity(
  type: FestivalActivity["type"],
  name = ACTIVITY_TYPES.find(([activityType]) => activityType === type)![1],
): FestivalActivityWithDetailsAndParticipants {
  const now = new Date();

  return {
    id: 42,
    name,
    description: `Descripción de ${name}`,
    registrationStartDate: new Date(now.getTime() - 60 * 60 * 1000),
    registrationEndDate: new Date(now.getTime() + 60 * 60 * 1000),
    promotionalArtUrl: null,
    festivalId: 7,
    visitorsDescription: null,
    type,
    activityPrizeUrl: null,
    allowsVoting: false,
    votingStartDate: null,
    votingEndDate: null,
    proofType: type === "coupon_book" ? "text" : "image",
    proofUploadLimitDate: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    accessLevel: "public",
    waitlistWindowMinutes: null,
    updatedAt: now,
    createdAt: now,
    details: [
      {
        id: 84,
        description: "Versión 1",
        imageUrl: "/activity-detail.png",
        couponBookHeaderImageUrl: null,
        participationLimit: 50,
        activityId: 42,
        category: "illustration",
        updatedAt: now,
        createdAt: now,
        participants: [],
        votes: [],
      },
    ],
    waitlistEntries: [],
  };
}

function getOpenRegistrationMessage(
  activity: FestivalActivityWithDetailsAndParticipants,
) {
  return `Registro abierto hasta ${DateTime.fromJSDate(
    activity.registrationEndDate,
  ).toLocaleString(DateTime.DATETIME_MED)}`;
}

async function renderPage(
  activity: FestivalActivityWithDetailsAndParticipants,
) {
  mocks.fetchFestivalActivity.mockResolvedValue(activity);

  const page = await FestivalActivityPage({
    params: Promise.resolve({
      profileId: currentProfile.id,
      festivalId: activity.festivalId,
      activityId: activity.id,
    }),
  });

  render(page);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getCurrentUserProfile.mockResolvedValue(currentProfile);
  mocks.protectRoute.mockResolvedValue(undefined);
  mocks.fetchFestivalParticipants.mockResolvedValue([]);
  vi.stubGlobal(
    "ResizeObserver",
    class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(STANDARD_ENROLLMENT_TYPES)(
  "%s activity page while registration is open",
  (type, activityName) => {
    it('shows the exact "Inscribirme" CTA and consent copy', async () => {
      const activity = buildOpenActivity(type, activityName);

      await renderPage(activity);

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: "Inscribirme" }),
        ).toBeTruthy();
      });
      expect(
        screen.getByRole("heading", { level: 1, name: activityName }),
      ).toBeTruthy();
      expect(screen.getByText(CONSENT_LABEL)).toBeTruthy();
      expect(screen.getByText(CONSENT_DESCRIPTION)).toBeTruthy();
      expect(
        screen.getByText(getOpenRegistrationMessage(activity)),
      ).toBeTruthy();
      expect(screen.queryByText("Registro no disponible")).toBeNull();
    });
  },
);

it("shows Sticker Print's direct enrollment CTA without consent copy", async () => {
  const activity = buildOpenActivity("sticker_print");

  await renderPage(activity);

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Inscribirme" })).toBeTruthy();
  });
  expect(
    screen.getByRole("heading", { level: 1, name: "Sticker-Print" }),
  ).toBeTruthy();
  expect(screen.queryByText(CONSENT_LABEL)).toBeNull();
  expect(screen.queryByText(CONSENT_DESCRIPTION)).toBeNull();
  expect(screen.getByText(getOpenRegistrationMessage(activity))).toBeTruthy();
  expect(screen.queryByText("Registro no disponible")).toBeNull();
});

it("shows Best Stand's specialized enrollment CTA and consent copy", async () => {
  const activity = buildOpenActivity("best_stand");

  await renderPage(activity);

  await waitFor(() => {
    expect(
      screen.getByRole("button", {
        name: "Quiero participar en la actividad",
      }),
    ).toBeTruthy();
  });
  expect(
    screen.getByRole("heading", { level: 1, name: "Stand Icónico" }),
  ).toBeTruthy();
  expect(screen.getByText(CONSENT_LABEL)).toBeTruthy();
  expect(screen.getByText(CONSENT_DESCRIPTION)).toBeTruthy();
  expect(screen.queryByText("Registro no disponible")).toBeNull();
});
