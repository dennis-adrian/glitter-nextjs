import { cn } from "@/app/lib/utils";

type LearningOutcomesListProps = {
  outcomes: string[];
  /** Tighter spacing for the program agenda rows. */
  compact?: boolean;
  className?: string;
};

// The landing's four-point sparkle.
const SPARKLE =
  "[clip-path:polygon(50%_0%,58%_42%,100%_50%,58%_58%,50%_100%,42%_58%,0%_50%,42%_42%)]";

export default function LearningOutcomesList({
  outcomes,
  compact,
  className,
}: LearningOutcomesListProps) {
  return (
    <ul
      className={cn(
        "grid gap-x-8 gap-y-3 bg-brand-lavender/50",
        compact
          ? "rounded-xl p-4 text-sm lg:grid-cols-2"
          : "rounded-2xl p-5 sm:grid-cols-2 sm:p-6",
        className,
      )}
    >
      {outcomes.map((outcome, index) => (
        <li
          // Outcomes are free text and may repeat.
          key={`${index}-${outcome}`}
          className="flex gap-3 font-medium leading-relaxed text-brand-ink"
        >
          <span
            aria-hidden="true"
            className={cn(
              "mt-2 size-2.5 shrink-0 bg-brand-primary",
              compact && "mt-1.5",
              SPARKLE,
            )}
          />
          {outcome}
        </li>
      ))}
    </ul>
  );
}
