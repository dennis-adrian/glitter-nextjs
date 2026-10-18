import Image from "next/image";

import { cn } from "@/app/lib/utils";

const FALLBACK_ARTWORK = "/img/landing-festivals/glitter-characters.png";

type ProgramArtworkFrameProps = {
  /** An allowed artwork URL, or null for the Glitter characters fallback. */
  src: string | null;
  alt?: string;
  sizes: string;
  priority?: boolean;
  shadow?: boolean;
  className?: string;
  imageClassName?: string;
};

/**
 * The landing's poster mat: a white frame around a lavender well. A program's
 * or session's campaign look lives inside it, never behind the page's text.
 */
export default function ProgramArtworkFrame({
  src,
  alt = "",
  sizes,
  priority,
  shadow,
  className,
  imageClassName,
}: ProgramArtworkFrameProps) {
  return (
    <div
      className={cn(
        "relative rounded-[20px] border border-brand-border bg-brand-card p-2",
        shadow && "shadow-[0_18px_42px_rgba(41,0,92,0.12)]",
        className,
      )}
    >
      <div className="relative size-full overflow-hidden rounded-[12px] bg-brand-lavender">
        <Image
          src={src ?? FALLBACK_ARTWORK}
          alt={alt}
          fill
          priority={priority}
          sizes={sizes}
          className={cn(
            src ? "object-cover" : "object-contain p-6",
            imageClassName,
          )}
        />
      </div>
    </div>
  );
}
