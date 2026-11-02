// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app/lib/users/actions", () => ({
  requestProfileReview: vi.fn(),
}));

import HomeReviewNote from "@/app/components/home/home-review-note";

const REJECTED = {
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

describe("HomeReviewNote", () => {
  afterEach(cleanup);

  it("quotes the team's reason for a rejected profile", () => {
    render(
      <HomeReviewNote
        profile={REJECTED as never}
        hasTasks
        rejectionReason="La foto no es tuya."
      />,
    );

    expect(screen.getByText("Tu perfil no fue verificado")).toBeTruthy();
    expect(screen.getByText("Motivo del equipo")).toBeTruthy();
    expect(screen.getByText("La foto no es tuya.")).toBeTruthy();
    expect(screen.queryByText(/correo que te enviamos/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Pedir una nueva revisión" }),
    ).toBeTruthy();
  });

  it("points to the email when the rejection has no stored reason", () => {
    render(<HomeReviewNote profile={REJECTED as never} hasTasks />);

    expect(screen.getByText(/Revisá el motivo en el correo/)).toBeTruthy();
    expect(screen.queryByText("Motivo del equipo")).toBeNull();
  });

  it("keeps the review button's own disabled reason", () => {
    render(
      <HomeReviewNote
        profile={{ ...REJECTED, phoneNumber: null } as never}
        hasTasks
        rejectionReason="La foto no es tuya."
      />,
    );

    expect(
      screen
        .getByRole("button", { name: "Pedir una nueva revisión" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByText("Completá tu perfil para pedir una nueva revisión."),
    ).toBeTruthy();
  });

  it("shows no reason on a profile under review", () => {
    render(
      <HomeReviewNote
        profile={{ ...REJECTED, status: "pending" } as never}
        hasTasks={false}
        rejectionReason="Viejo motivo"
      />,
    );

    expect(screen.getByText("Tu perfil está en revisión")).toBeTruthy();
    expect(screen.queryByText("Viejo motivo")).toBeNull();
  });
});
