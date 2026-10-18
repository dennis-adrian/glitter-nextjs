import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Next hands route params to the page as strings, whatever its props type
 * claims. The page has to pass on the parsed numbers: the proof removal action
 * compares the festival id strictly, so a raw "1" refused every participant's
 * own design.
 */

const mocks = vi.hoisted(() => ({
  currentProfile: { id: 3, role: "user" } as Record<string, unknown>,
  festival: {
    id: 1,
    festivalActivities: [
      { id: 10, type: "sticker_print", name: "Sticker-Print", details: [] },
    ],
  },
  enrollRedirectButton: vi.fn<(props: Record<string, unknown>) => null>(
    () => null,
  ),
  fetchUserProfileById: vi.fn(),
  getFestivalById: vi.fn(),
  protectRoute: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/app/lib/users/queries", () => ({
  fetchUserProfileById: mocks.fetchUserProfileById,
}));
vi.mock("@/app/lib/festivals/helpers", () => ({
  getFestivalById: mocks.getFestivalById,
}));
vi.mock("@/app/lib/festivals/utils", () => ({
  withoutParticipantRoster: (festival: unknown) => festival,
}));
vi.mock("@/app/lib/users/helpers", () => ({
  getCurrentUserProfile: async () => mocks.currentProfile,
  protectRoute: mocks.protectRoute,
}));
vi.mock(
  "@/app/components/festivals/festival_activities/enroll-redirect-button",
  () => ({ default: mocks.enrollRedirectButton }),
);
vi.mock("@/app/components/pages/festival_activities/passport-activity", () => ({
  default: () => null,
}));

import ParticipantsActivityPage from "@/app/(routes)/profiles/[profileId]/festivals/[festivalId]/activity/page";

type PageProps = Parameters<typeof ParticipantsActivityPage>[0];

/** The params exactly as Next passes them: strings. */
function stringParams(profileId: string, festivalId: string) {
  return {
    params: Promise.resolve({ profileId, festivalId }),
  } as unknown as PageProps;
}

describe("participant activities page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFestivalById.mockResolvedValue(mocks.festival);
  });

  it("hands the enroll button the festival id as a number", async () => {
    const page = await ParticipantsActivityPage(stringParams("3", "1"));
    // A server component returns its tree; render just the button's props.
    const button = (
      page as { props: { children: React.ReactElement[] } }
    ).props.children.find(
      (child) => child?.type === mocks.enrollRedirectButton,
    );

    expect(button?.props).toMatchObject({ festivalId: 1 });
    expect(typeof (button?.props as { festivalId: unknown }).festivalId).toBe(
      "number",
    );
    expect(mocks.getFestivalById).toHaveBeenCalledWith(1);
    expect(mocks.protectRoute).toHaveBeenCalledWith(mocks.currentProfile, 3);
  });

  it("recognises the viewer's own profile instead of loading it again", async () => {
    await ParticipantsActivityPage(stringParams("3", "1"));

    expect(mocks.fetchUserProfileById).not.toHaveBeenCalled();
  });

  it("refuses params that are not numbers", async () => {
    await expect(
      ParticipantsActivityPage(stringParams("tres", "1")),
    ).rejects.toThrow("notFound");
  });
});
