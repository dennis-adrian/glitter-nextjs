import Image, { type ImageProps } from "next/image";

import { cn } from "@/app/lib/utils";

type ThemeImageProps = Omit<ImageProps, "src" | "preload"> & {
  srcLight: ImageProps["src"];
  srcDark: ImageProps["src"];
};

/**
 * Two images, one per theme, with the other hidden by the `.dark` class.
 *
 * Leave `loading` at its lazy default where you can: the browser skips a lazy
 * image while it is `display: none`, so only the visible one downloads.
 * `loading="eager"` fetches both, which is only worth it for a small image
 * that is the page's largest contentful paint (the navbar wordmark).
 */
export default function ThemeImage({
  srcLight,
  srcDark,
  className,
  ...rest
}: ThemeImageProps) {
  return (
    <>
      <Image
        {...rest}
        src={srcLight}
        className={cn(className, "dark:hidden")}
      />
      <Image
        {...rest}
        src={srcDark}
        className={cn(className, "hidden dark:block")}
      />
    </>
  );
}
