import { Badge } from "@/app/components/ui/badge";
import {
  OCCURRENCE_STATE_LABELS,
  type OccurrenceEffectiveState,
} from "@/app/lib/programs/state";

type Props = {
  state: OccurrenceEffectiveState;
  wasRescheduled?: boolean;
  hideOnSale?: boolean;
};

const VARIANT_BY_STATE: Record<
  OccurrenceEffectiveState,
  "green" | "amber" | "red" | "secondary" | "outline"
> = {
  on_sale: "green",
  sales_not_started: "amber",
  sales_closed: "secondary",
  completed: "secondary",
  cancelled: "red",
  draft: "outline",
};

/** The effective state of one occurrence, resolved by `resolveOccurrenceState`. */
export default function ProgramStatusBadge({
  state,
  wasRescheduled,
  hideOnSale,
}: Props) {
  const showState = !hideOnSale || state !== "on_sale";

  if (!showState && !wasRescheduled) return null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {showState ? (
        <Badge variant={VARIANT_BY_STATE[state]}>
          {OCCURRENCE_STATE_LABELS[state]}
        </Badge>
      ) : null}
      {wasRescheduled ? <Badge variant="amber">Reprogramada</Badge> : null}
    </span>
  );
}
