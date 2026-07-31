import { cn } from "@/app/lib/utils";
import { citrusGothicInline, citrusGothicSolid } from "@/app/ui/fonts";

type Props = {
  className?: string;
  compact?: boolean;
  title: string;
  tone?: "light" | "ink";
};

/**
 * Temporary code-native program mark. It stays editable and responsive until
 * final campaign artwork replaces it.
 */
export default function GlitterWeekLockup({
  className,
  compact = false,
  title,
  tone = "light",
}: Props) {
  const isLight = tone === "light";
  const words = title.trim().split(/\s+/).filter(Boolean);
  const accent = words.length > 1 ? words.at(-1) : null;
  const primary = accent ? words.slice(0, -1).join(" ") : title;
  const titleLength = title.trim().length;
  const sizeClass = compact
    ? titleLength > 18
      ? "text-lg"
      : "text-2xl"
    : titleLength > 28
      ? "text-[clamp(2.6rem,6vw,5rem)]"
      : titleLength > 14
        ? "text-[clamp(3.2rem,8vw,6.4rem)]"
        : "text-[clamp(4.4rem,12vw,8.4rem)]";

  return (
    <span
      role="img"
      aria-label={title}
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
          "max-w-[12ch] text-balance leading-[0.82] tracking-[0.01em]",
          sizeClass,
          isLight ? "text-[#fffaf3]" : "text-[#4b255f]",
        )}
      >
        {primary}
      </span>
      {accent ? (
        <span
          aria-hidden="true"
          className={cn(
            citrusGothicInline.className,
            "max-w-[12ch] text-balance leading-[0.82] tracking-[0.015em]",
            sizeClass,
            isLight ? "text-[#ffbe57]" : "text-[#9347f5]",
          )}
        >
          {accent}
        </span>
      ) : null}
    </span>
  );
}
