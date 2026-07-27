import { featureFlagUserTargets, featureFlags } from "@/db/schema";

export type FeatureFlag = typeof featureFlags.$inferSelect;
export type FeatureFlagVisibility = FeatureFlag["visibility"];
export type FeatureFlagUserTarget = typeof featureFlagUserTargets.$inferSelect;

/** A targeted user with the identity fields the admin UI displays. */
export type FeatureFlagTarget = {
  id: number;
  userId: number;
  note: string | null;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

/** A flag row plus everything needed to evaluate and administer it. */
export type FeatureFlagWithTargets = FeatureFlag & {
  targets: FeatureFlagTarget[];
};

export const FEATURE_FLAG_VISIBILITIES: FeatureFlagVisibility[] = [
  "hidden",
  "admin_only",
  "public",
];

export const FEATURE_FLAG_VISIBILITY_LABELS: Record<
  FeatureFlagVisibility,
  string
> = {
  hidden: "Oculta",
  admin_only: "Solo administración",
  public: "Pública",
};

export const FEATURE_FLAG_VISIBILITY_DESCRIPTIONS: Record<
  FeatureFlagVisibility,
  string
> = {
  hidden: "Nadie ve la funcionalidad, salvo las personas agregadas abajo.",
  admin_only:
    "El equipo de administración la ve en cualquier entorno; el público no.",
  public: "Todo el mundo la ve.",
};

export type UpdateFeatureFlagInput = {
  key: string;
  visibility: FeatureFlagVisibility;
};

export type AddFeatureFlagTargetInput = {
  key: string;
  email: string;
  note?: string | null;
};

export type RemoveFeatureFlagTargetInput = {
  key: string;
  userId: number;
};

/** Name to show for a targeted user, falling back through what is populated. */
export function targetDisplayName(target: FeatureFlagTarget): string {
  const fullName = [target.firstName, target.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  return target.displayName?.trim() || fullName || target.email;
}
