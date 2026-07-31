import { describe, expect, it } from "vitest";

import type { BaseProfile } from "@/app/api/users/definitions";
import type { FeatureFlagVisibility } from "@/app/lib/feature_flags/definitions";
import {
  canPreviewUnlaunchedFeatures,
  isFeatureVisible,
  isTargetedUser,
  type FeatureFlagRule,
} from "@/app/lib/feature_flags/visibility";

function viewer(role: BaseProfile["role"], id = 1) {
  return { id, role };
}

function rule(
  visibility: FeatureFlagVisibility,
  targetedUserIds: number[] = [],
): FeatureFlagRule {
  return { visibility, targetedUserIds };
}

describe("isFeatureVisible", () => {
  it("hides a hidden feature from everyone, admins included", () => {
    const roles: BaseProfile["role"][] = [
      "admin",
      "festival_admin",
      "artist",
      "user",
    ];

    for (const role of roles) {
      expect(isFeatureVisible(rule("hidden"), viewer(role))).toBe(false);
    }
    expect(isFeatureVisible(rule("hidden"), null)).toBe(false);
  });

  it("shows an admin_only feature to admins and festival admins only", () => {
    expect(isFeatureVisible(rule("admin_only"), viewer("admin"))).toBe(true);
    expect(isFeatureVisible(rule("admin_only"), viewer("festival_admin"))).toBe(
      true,
    );
    expect(isFeatureVisible(rule("admin_only"), viewer("artist"))).toBe(false);
    expect(isFeatureVisible(rule("admin_only"), viewer("user"))).toBe(false);
    expect(isFeatureVisible(rule("admin_only"), null)).toBe(false);
    expect(isFeatureVisible(rule("admin_only"), undefined)).toBe(false);
  });

  it("shows a public feature to signed-out visitors", () => {
    expect(isFeatureVisible(rule("public"), null)).toBe(true);
    expect(isFeatureVisible(rule("public"), viewer("user"))).toBe(true);
  });

  it("covers every visibility value", () => {
    const visibilities: FeatureFlagVisibility[] = [
      "hidden",
      "admin_only",
      "public",
    ];

    for (const visibility of visibilities) {
      expect(typeof isFeatureVisible(rule(visibility), viewer("admin"))).toBe(
        "boolean",
      );
    }
  });
});

describe("targeting", () => {
  it("shows a hidden feature to a targeted tester", () => {
    const tester = viewer("user", 42);

    expect(isFeatureVisible(rule("hidden", [42]), tester)).toBe(true);
    expect(isFeatureVisible(rule("hidden", [42]), viewer("user", 43))).toBe(
      false,
    );
  });

  it("shows an admin_only feature to a targeted non-admin", () => {
    expect(isFeatureVisible(rule("admin_only", [7]), viewer("user", 7))).toBe(
      true,
    );
  });

  it("never removes access a visibility already granted", () => {
    // Allowlist only: being untargeted cannot demote a public feature.
    expect(isFeatureVisible(rule("public", [99]), viewer("user", 1))).toBe(
      true,
    );
    expect(isFeatureVisible(rule("public", [99]), null)).toBe(true);
  });

  it("cannot target a signed-out visitor", () => {
    expect(isTargetedUser(rule("hidden", [1, 2, 3]), null)).toBe(false);
    expect(isFeatureVisible(rule("hidden", [1, 2, 3]), null)).toBe(false);
  });

  it("matches on user id, not role", () => {
    expect(isTargetedUser(rule("hidden", [5]), viewer("user", 5))).toBe(true);
    expect(isTargetedUser(rule("hidden", [5]), viewer("admin", 6))).toBe(false);
  });
});

describe("canPreviewUnlaunchedFeatures", () => {
  it("matches the admin tier used elsewhere in the dashboard", () => {
    expect(canPreviewUnlaunchedFeatures(viewer("admin"))).toBe(true);
    expect(canPreviewUnlaunchedFeatures(viewer("festival_admin"))).toBe(true);
    expect(canPreviewUnlaunchedFeatures(viewer("artist"))).toBe(false);
    expect(canPreviewUnlaunchedFeatures(null)).toBe(false);
  });
});
