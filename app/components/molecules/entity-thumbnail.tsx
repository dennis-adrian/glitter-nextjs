import Image from "next/image";

import MediaPlaceholder from "@/app/components/atoms/media-placeholder";
import { cn } from "@/app/lib/utils";

const SIZE_CLASSES = {
  sm: "h-10 w-10",
  md: "aspect-[16/10] w-full",
} as const;

type EntityThumbnailProps = {
  src?: string | null;
  alt: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
};

export default function EntityThumbnail({
  src,
  alt,
  size = "sm",
  className,
}: EntityThumbnailProps) {
  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-md bg-muted",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          className="object-cover"
          sizes={size === "sm" ? "40px" : "(max-width: 768px) 100vw, 33vw"}
        />
      ) : (
        <MediaPlaceholder />
      )}
    </div>
  );
}
