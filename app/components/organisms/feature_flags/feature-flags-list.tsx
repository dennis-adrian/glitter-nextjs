import FeatureFlagCard from "@/app/components/organisms/feature_flags/feature-flag-card";
import type { FeatureFlagWithTargets } from "@/app/lib/feature_flags/definitions";
import {
  FEATURE_FLAG_KEYS,
  getFeatureFlagDefinition,
} from "@/app/lib/feature_flags/registry";

type Props = {
  flags: FeatureFlagWithTargets[];
};

/**
 * Iterates the registry rather than the rows, so the list is typed end to end,
 * always in registry order, and silently drops rows whose flag has been removed
 * from the code.
 */
export default function FeatureFlagsList({ flags }: Props) {
  const rowsByKey = new Map(flags.map((flag) => [flag.key, flag]));

  const cards = FEATURE_FLAG_KEYS.map((key) => {
    const flag = rowsByKey.get(key);
    if (!flag) return null;

    return (
      <FeatureFlagCard
        key={key}
        flag={flag}
        definition={getFeatureFlagDefinition(key)}
      />
    );
  }).filter((card) => card !== null);

  if (cards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay funcionalidades registradas todavía.
      </p>
    );
  }

  return <div className="grid gap-6 md:grid-cols-2">{cards}</div>;
}
