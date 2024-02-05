import { cn } from "@/app/lib/utils";
import Image, { ImageProps } from "next/image";
import { HTMLAttributes } from "react";

export function Avatar({
  children,
  className,
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AvatarImage({ src, alt, height = 64, width = 64 }: ImageProps) {
  return (
    <Image
      alt={alt}
      src={src}
      height={height}
      width={width}
      blurDataURL="/img/blur-data-img.png"
    />
  );
}
