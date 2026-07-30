import { SparklesIcon } from "lucide-react";

import { cn } from "@/app/lib/utils";
import { citrusGothicInline, citrusGothicSolid } from "@/app/ui/fonts";

type Props = {
  className?: string;
  compact?: boolean;
  tone?: "light" | "ink";
};

/**
 * Temporary code-native campaign mark. It stays editable and responsive until
 * the final Glitter Week artwork replaces it.
 */
export default function GlitterWeekLockup({
  className,
  compact = false,
  tone = "light",
}: Props) {
  const isLight = tone === "light";

  return (
    <span
      aria-label="Glitter Week"
      className={cn(
        "relative inline-flex flex-col uppercase",
        compact ? "gap-0" : "gap-1",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          citrusGothicSolid.className,
          "leading-[0.78] tracking-[0.01em]",
          compact ? "text-2xl" : "text-[clamp(4.4rem,12vw,8.4rem)]",
          isLight ? "text-[#fffaf3]" : "text-[#4b255f]",
        )}
      >
        Glitter
      </span>
      <span className="relative inline-flex items-center">
        <span
          aria-hidden="true"
          className={cn(
            citrusGothicInline.className,
            "leading-[0.78] tracking-[0.015em]",
            compact ? "text-2xl" : "text-[clamp(4.4rem,12vw,8.4rem)]",
            isLight ? "text-[#ffbe57]" : "text-[#9347f5]",
          )}
        >
          Week
        </span>
        <SparklesIcon
          aria-hidden="true"
          className={cn(
            "absolute -right-6 -top-2 rotate-12",
            compact ? "size-4" : "size-7 sm:size-10",
            isLight ? "text-[#ffbe57]" : "text-[#f7aee8]",
          )}
          strokeWidth={2.5}
        />
      </span>
    </span>
  );
}
