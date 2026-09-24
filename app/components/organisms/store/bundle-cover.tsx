import Image from "next/image";
import { PLACEHOLDER_IMAGE_URLS } from "@/app/lib/constants";
import { cn } from "@/lib/utils";

type BundleCoverProps = {
  name: string;
  imageUrl: string | null;
  /** Component artwork used as a collage when the bundle has no cover. */
  componentImageUrls: (string | null)[];
  sizes: string;
  className?: string;
  priority?: boolean;
};

export default function BundleCover({
  name,
  imageUrl,
  componentImageUrls,
  sizes,
  className,
  priority,
}: BundleCoverProps) {
  if (imageUrl) {
    return (
      <div className={cn("relative overflow-hidden bg-muted", className)}>
        <Image
          src={imageUrl}
          alt={`Combo ${name}`}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }
  const images = componentImageUrls
    .map((url) => url ?? PLACEHOLDER_IMAGE_URLS["500"])
    .slice(0, 4);
  return (
    <div
      role="img"
      aria-label={`Productos incluidos en el combo ${name}`}
      className={cn(
        "relative grid gap-1 overflow-hidden bg-brand-lavender p-1",
        images.length > 1 ? "grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {images.map((url, index) => (
        <div
          key={`${url}-${index}`}
          className={cn(
            "relative overflow-hidden rounded-md bg-background",
            images.length === 3 && index === 0 && "row-span-2",
          )}
        >
          <Image
            src={url}
            alt=""
            fill
            sizes={sizes}
            priority={priority && index === 0}
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}
