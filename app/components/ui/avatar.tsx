'use client';
import { cn } from "@/app/lib/utils";
import Image, { ImageProps } from "next/image";
import { HTMLAttributes, useState } from "react";

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
  src,
  alt,
  ...props
}: ImageProps) {
  const [imgSrc, setImgSrc] = useState(src);
  return (
    <Image
      className="rounded-full object-cover absolute inset-0 w-full h-full"
      alt={alt}
      src={imgSrc || "/img/placeholders/avatar-placeholder.png"}
      placeholder="blur"
      blurDataURL="/img/placeholders/avatar-placeholder.png"
      onError={() => setImgSrc("/img/placeholders/avatar-placeholder.png")}
      fill
      {...props}
    />
  );
}
