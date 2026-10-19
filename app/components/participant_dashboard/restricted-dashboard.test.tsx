// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The request button reaches a "use server" module that imports
// `server-only`, which throws outside a server build.
vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/actions", () => ({
  requestProfileReview: vi.fn(),
}));

import RestrictedDashboard from "@/app/components/participant_dashboard/restricted-dashboard";

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
const INCOMPLETE_PROFILE = { ...COMPLETE_PROFILE, phoneNumber: null };

function requestButton() {
  return screen.queryByRole("button", { name: "Pedir una nueva revisión" });
}

describe("RestrictedDashboard", () => {
  afterEach(cleanup);

  it("lets a rejected, complete profile ask for a new review", () => {
    render(
      <RestrictedDashboard
        profile={COMPLETE_PROFILE as never}
        status="rejected"
      />,
    );

    expect(requestButton()?.hasAttribute("disabled")).toBe(false);
    expect(
      screen
        .getByRole("link", { name: "Corregir mi perfil" })
        .getAttribute("href"),
    ).toBe("/my_profile");
    expect(screen.getByText(/pedí una nueva revisión/)).toBeTruthy();
    expect(screen.queryByText(/volvé a solicitar la verificación/)).toBeNull();
  });

  it("disables the request with its reason while the profile is incomplete", () => {
    render(
      <RestrictedDashboard
        profile={INCOMPLETE_PROFILE as never}
        status="rejected"
      />,
    );

    expect(requestButton()?.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByText("Completá tu perfil para pedir una nueva revisión."),
    ).toBeTruthy();
  });

  it("shows the pending state, with no request button, once in review", () => {
    render(
      <RestrictedDashboard
        profile={{ ...COMPLETE_PROFILE, status: "pending" } as never}
        status="pending"
      />,
    );

    expect(screen.getByText("Tu perfil está en revisión")).toBeTruthy();
    expect(requestButton()).toBeNull();
  });

  it("offers no review request to a disabled account", () => {
    render(
      <RestrictedDashboard
        profile={{ ...COMPLETE_PROFILE, status: "banned" } as never}
        status="banned"
      />,
    );

    expect(requestButton()).toBeNull();
  });
});
