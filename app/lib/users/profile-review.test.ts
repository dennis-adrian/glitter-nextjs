import { describe, expect, it } from "vitest";

import { profileReviewBlocker } from "@/app/lib/users/profile-review";

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
} as never;

describe("profileReviewBlocker", () => {
  it("lets a complete profile ask for a new review", () => {
    expect(profileReviewBlocker(COMPLETE_PROFILE)).toBeUndefined();
  });

  it("asks an incomplete profile to finish it first", () => {
    expect(
      profileReviewBlocker({
        ...(COMPLETE_PROFILE as object),
        phoneNumber: null,
      } as never),
    ).toBe("Completá tu perfil para pedir una nueva revisión.");
  });

  it.each([
    "https://img.clerk.com/avatar-default",
    "https://files.edgestore.dev/old/ana.png",
  ])("asks for a real picture instead of the placeholder %s", (imageUrl) => {
    expect(
      profileReviewBlocker({
        ...(COMPLETE_PROFILE as object),
        imageUrl,
      } as never),
    ).toBe("Subí una foto de perfil para pedir una nueva revisión.");
  });
});
