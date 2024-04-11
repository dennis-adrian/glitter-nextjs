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

export function AvatarImage({
  src = "/img/profile-avatar.png",
  alt,
  height = 64,
  width = 64,
}: ImageProps) {
  return (
    <Image
      className="rounded-full object-cover absolute inset-0 w-full h-full"
      alt={alt}
      src={src}
      placeholder="blur"
      blurDataURL="/img/profile-avatar.png"
      fill
    />
  );
}
