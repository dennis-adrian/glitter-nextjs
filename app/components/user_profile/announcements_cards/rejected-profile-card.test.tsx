// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The request button reaches a "use server" module that imports
// `server-only`, which throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/actions", () => ({
  requestProfileReview: vi.fn(),
}));

import RejectedProfileCard from "@/app/components/user_profile/announcements_cards/rejected-profile.card";

const COMPLETE_PROFILE = {
  id: 7,
  status: "rejected",
  displayName: "Ana Ilustra",
  email: "ana@example.com",
  bio: "Ilustradora",
  imageUrl: "https://utfs.io/f/ana",
  firstName: "Ana",
  lastName: "Paz",
  birthdate: new Date("1995-05-05"),
  phoneNumber: "70000000",
  gender: "female",
  country: "BO",
  category: "illustration",
  profileSubcategories: [{ subcategoryId: 1 }],
  userSocials: [{ type: "instagram", username: "ana" }],
};

function requestButton() {
  return screen.queryByRole("button", { name: "Pedir una nueva revisión" });
}

describe("RejectedProfileCard", () => {
  afterEach(cleanup);

  it("points to a new review instead of writing to soporte", () => {
    render(<RejectedProfileCard profile={COMPLETE_PROFILE as never} />);

    expect(screen.getByText(/pedí una nueva revisión/)).toBeTruthy();
    expect(screen.queryByText(/contactate a soporte/)).toBeNull();
  });

  it("lets a complete profile ask for the review", () => {
    render(<RejectedProfileCard profile={COMPLETE_PROFILE as never} />);

    expect(requestButton()?.hasAttribute("disabled")).toBe(false);
  });

  it("disables the request with its reason while the profile is incomplete", () => {
    render(
      <RejectedProfileCard
        profile={{ ...COMPLETE_PROFILE, phoneNumber: null } as never}
      />,
    );

    expect(requestButton()?.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("Completá tu perfil para pedir una nueva revisión."),
    ).toBeTruthy();
  });

  it("shows no button where it is rendered without a profile, as for admins", () => {
    render(<RejectedProfileCard />);

    expect(requestButton()).toBeNull();
  });

  it("speaks about the participant, not to them, where rendered for admins", () => {
    render(<RejectedProfileCard />);

    expect(
      screen.getByText(
        "Perfil rechazado. El participante puede pedir una nueva revisión desde su perfil.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Tu perfil/)).toBeNull();
  });
});
