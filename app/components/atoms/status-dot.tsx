import { cn } from "@/lib/utils";

/**
 * Tones for state that repeats on every row or card. Dense lists read better
 * when routine state is a dot rather than a filled pill, so a pill stays
 * available for the one exception per row that should interrupt the scan.
 */
const TONE_CLASSES = {
  neutral: "bg-gray-400",
  info: "bg-blue-500",
  warning: "bg-amber-500",
  success: "bg-green-600",
  danger: "bg-red-500",
} as const;

export type StatusTone = keyof typeof TONE_CLASSES;

type StatusDotProps = {
  tone: StatusTone;
  label: string;
  className?: string;
};

export default function StatusDot({ tone, label, className }: StatusDotProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-sm",
        className,
      )}
    >
      {/* Decorative: the label already carries the status for screen readers. */}
      <span
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", TONE_CLASSES[tone])}
      />
      {label}
    </span>
  );
}
