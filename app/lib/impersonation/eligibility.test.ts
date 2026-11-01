import { describe, expect, it } from "vitest";

import type { BaseProfile } from "@/app/api/users/definitions";
import {
  canBeImpersonated,
  impersonationRefusal,
} from "@/app/lib/impersonation/eligibility";

type Role = BaseProfile["role"];

const admin = { id: 1, role: "admin" as Role };
const participant = { id: 2, role: "user" as Role };

function refusal(overrides: Partial<Parameters<typeof impersonationRefusal>[0]>) {
  return impersonationRefusal({
    actor: admin,
    actorIsViewing: false,
    subject: participant,
    subjectPendingDeletion: false,
    ...overrides,
  });
}

describe("impersonationRefusal", () => {
  it("lets a global admin view a participant", () => {
    expect(refusal({})).toBeNull();
  });

  it.each<[string, Role]>([
    ["a festival admin", "festival_admin"],
    ["a participant", "user"],
    ["an artist", "artist"],
  ])("refuses %s as the actor", (_, role) => {
    expect(refusal({ actor: { id: 1, role } })).toBe("not_admin");
  });

  it("refuses when nobody is signed in", () => {
    expect(refusal({ actor: null })).toBe("not_admin");
    expect(refusal({ actor: undefined })).toBe("not_admin");
  });

  it("refuses to start a second view from inside one", () => {
    expect(refusal({ actorIsViewing: true })).toBe("already_viewing");
  });

  it("refuses a profile that does not exist", () => {
    expect(refusal({ subject: null })).toBe("not_found");
  });

  it("refuses yourself", () => {
    expect(refusal({ subject: { id: admin.id, role: "user" } })).toBe("self");
  });

  it.each<Role>(["admin", "festival_admin"])(
    "refuses a staff account (%s)",
    (role) => {
      expect(refusal({ subject: { id: 3, role } })).toBe("staff");
    },
  );

  it("refuses a role that is not a participant", () => {
    expect(refusal({ subject: { id: 3, role: "artist" } })).toBe(
      "not_participant",
    );
  });

  it("refuses an account being deleted", () => {
    expect(refusal({ subjectPendingDeletion: true })).toBe("deleting");
  });

  it("checks the actor before anything about the subject", () => {
    expect(
      refusal({
        actor: { id: 1, role: "festival_admin" },
        subject: null,
        subjectPendingDeletion: true,
      }),
    ).toBe("not_admin");
  });
});

describe("canBeImpersonated", () => {
  it("offers participants only", () => {
    expect(canBeImpersonated({ role: "user" })).toBe(true);
    expect(canBeImpersonated({ role: "admin" })).toBe(false);
    expect(canBeImpersonated({ role: "festival_admin" })).toBe(false);
    expect(canBeImpersonated({ role: "artist" })).toBe(false);
    expect(canBeImpersonated(null)).toBe(false);
    expect(canBeImpersonated(undefined)).toBe(false);
  });
});
