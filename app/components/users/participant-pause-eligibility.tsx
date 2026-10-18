import { cn } from "@/lib/utils";

export const PARTICIPANT_PAUSE_ELIGIBLE_MESSAGE =
  "Sin participación en los últimos 3 festivales · se puede pausar";

export function participantEligibleSurfaceClass(isEligible: boolean) {
  return isEligible
    ? "group border-amber-200 bg-amber-50/70 hover:bg-amber-100/40 dark:border-amber-900/60 dark:bg-amber-950/20 dark:hover:bg-amber-900/20"
    : "";
}

export function participantEligibleStickyCellClass(isEligible: boolean) {
  return isEligible
    ? "bg-amber-50/70 group-hover:bg-amber-100/40 dark:bg-amber-950/20 dark:group-hover:bg-amber-900/20"
    : "bg-card";
}

type PauseEligibilityNoticeProps = {
  className?: string;
};

export function PauseEligibilityNotice({
  className,
}: PauseEligibilityNoticeProps) {
  return (
    <p
      className={cn(
        "text-xs leading-snug text-amber-800 dark:text-amber-200",
        className,
      )}
    >
      {PARTICIPANT_PAUSE_ELIGIBLE_MESSAGE}
    </p>
  );
}
