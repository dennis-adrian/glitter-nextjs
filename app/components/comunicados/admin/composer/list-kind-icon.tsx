import { FilterIcon, ListChecksIcon } from "lucide-react";

import {
  DISTRIBUTION_LIST_KIND_LABELS,
  type DistributionListKind,
} from "@/app/lib/distribution_lists/definitions";

/** A saved list's kind as an icon, named for screen readers. */
export default function ListKindIcon({ kind }: { kind: DistributionListKind }) {
  const Icon = kind === "filter" ? FilterIcon : ListChecksIcon;
  return (
    <span
      className="inline-flex shrink-0 text-muted-foreground"
      title={DISTRIBUTION_LIST_KIND_LABELS[kind]}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="sr-only">{DISTRIBUTION_LIST_KIND_LABELS[kind]}</span>
    </span>
  );
}
