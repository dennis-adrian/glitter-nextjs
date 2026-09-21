import { describe, expect, it } from "vitest";

import {
  pickSelfEditableProfileFields,
  SELF_EDITABLE_PROFILE_FIELDS,
} from "@/app/lib/users/profile-fields";

describe("pickSelfEditableProfileFields", () => {
  it("keeps the fields a profile owner is allowed to edit", () => {
    const birthdate = new Date("1998-04-12T00:00:00.000Z");

    expect(
      pickSelfEditableProfileFields({
        firstName: "Ana",
        lastName: "Quiroga",
        displayName: "anaq",
        bio: "Ilustradora",
        birthdate,
        gender: "female",
        country: "BO",
        state: "SC",
        phoneNumber: "70000000",
        imageUrl: "https://utfs.io/f/abc",
      }),
    ).toEqual({
      firstName: "Ana",
      lastName: "Quiroga",
      displayName: "anaq",
      bio: "Ilustradora",
      birthdate,
      gender: "female",
      country: "BO",
      state: "SC",
      phoneNumber: "70000000",
      imageUrl: "https://utfs.io/f/abc",
    });
  });

  it("drops the columns that decide what a profile may do", () => {
    const sanitized = pickSelfEditableProfileFields({
      displayName: "anaq",
      status: "verified",
      role: "admin",
      verifiedAt: new Date(),
      category: "illustrator",
      email: "attacker@example.com",
      clerkId: "user_someone_else",
      participationType: "individual",
      shouldSubmitProducts: false,
    } as never);

    expect(sanitized).toEqual({ displayName: "anaq" });
  });

  it("does not invent keys the caller left out", () => {
    expect(pickSelfEditableProfileFields({})).toEqual({});
    expect(
      Object.keys(pickSelfEditableProfileFields({ bio: undefined })),
    ).toEqual(["bio"]);
  });

  it("never lists a privileged column in the allow-list", () => {
    for (const field of [
      "status",
      "role",
      "verifiedAt",
      "category",
      "email",
      "clerkId",
      "participationType",
      "shouldSubmitProducts",
    ]) {
      expect(SELF_EDITABLE_PROFILE_FIELDS).not.toContain(field);
    }
  });
});
