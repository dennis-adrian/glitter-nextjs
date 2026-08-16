"use client";
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
        "relative flex h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-white",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AvatarImage({
  // since we are defining a src fallback, we can make src not required
  src,
  alt,
  // `fill` without `sizes` makes the browser assume the image is as wide as the
  // viewport, so a thumbnail downloads the ~828px file. 128px covers the largest
  // Avatar in use without over-serving the rest; pass `sizes` explicitly
  // wherever the box is smaller and the list is long.
  sizes = "128px",
  ...props
}: Omit<ImageProps, "src"> & { src?: string | null }) {
  return (
    <Image
      className="rounded-full object-cover absolute inset-0 w-full h-full"
      alt={alt}
      src={src || "/img/placeholders/avatar-placeholder.png"}
      placeholder="blur"
      blurDataURL="/img/placeholders/avatar-placeholder.png"
      fill
      sizes={sizes}
      {...props}
    />
  );
}
