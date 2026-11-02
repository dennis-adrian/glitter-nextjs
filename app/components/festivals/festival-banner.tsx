import Image, { getImageProps } from "next/image";

import {
  resolveFestivalBanner,
  type FestivalBannerSource,
} from "@/app/lib/festivals/banner";

// Intrinsic sizes for the aspect ratio reserved before the file loads; the
// natural aspect (`h-auto w-full`) wins afterwards, so the banner's own text
// is never cropped.
const WIDE = { width: 2000, height: 667 } as const; // 3:1
const MOBILE = { width: 1200, height: 800 } as const; // 3:2

/** Matches Tailwind's `md`, where the wide banner takes over. */
export const FESTIVAL_BANNER_WIDE_MEDIA = "(min-width: 768px)";

type FestivalBannerProps = {
  festival: FestivalBannerSource;
  alt: string;
  sizes: string;
  /** The banner is the page's LCP image: fetch it first. */
  highPriority?: boolean;
  className?: string;
};

/**
 * A festival's hero banner, art-directed: the 3:2 phone banner below `md`
 * and the 3:1 banner from `md` up (see `resolveFestivalBanner` for the
 * fallbacks). Renders nothing when the festival has no banner.
 */
export default function FestivalBanner({
  festival,
  alt,
  sizes,
  highPriority = false,
  className = "h-auto w-full",
}: FestivalBannerProps) {
  const banner = resolveFestivalBanner(festival);
  if (!banner) return null;

  if (!banner.mobileSrc) {
    // One image for every width, as before the phone banner existed.
    return (
      <Image
        src={banner.wideSrc}
        alt={alt}
        // Reserve the space of the file actually shown.
        {...(banner.wideIsPhoneBanner ? MOBILE : WIDE)}
        sizes={sizes}
        className={className}
        preload={highPriority}
      />
    );
  }

  // Two images: the browser fetches only the source whose media matches,
  // eager or not. `preload` would not: its <link> carries the phone srcset
  // without the media query, so desktops would fetch the phone banner too.
  // An LCP banner is therefore eager with fetchPriority high, not lazy.
  const common = { alt, sizes } as const;
  const {
    props: { srcSet: wideSrcSet },
  } = getImageProps({ ...common, ...WIDE, src: banner.wideSrc });
  const { props: mobileImg } = getImageProps({
    ...common,
    ...MOBILE,
    src: banner.mobileSrc,
    fetchPriority: highPriority ? "high" : undefined,
    loading: highPriority ? "eager" : undefined,
  });

  return (
    <picture>
      <source
        media={FESTIVAL_BANNER_WIDE_MEDIA}
        srcSet={wideSrcSet}
        sizes={sizes}
        {...WIDE}
      />
      <img {...mobileImg} alt={alt} className={className} />
    </picture>
  );
}
