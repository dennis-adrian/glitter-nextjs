import {
  siFacebook,
  siInstagram,
  siTiktok,
  siWhatsapp,
  siX,
  siYoutube,
  type SimpleIcon,
} from "simple-icons";

import { cn } from "@/app/lib/utils";

/**
 * The brand marks the app shows, all from Simple Icons
 * (https://simpleicons.org) so they are drawn alike. Only the ones named here
 * end up in the bundle. `twitter` is the name stored for a profile's social;
 * its mark is X's.
 */
const BRANDS = {
  facebook: siFacebook,
  instagram: siInstagram,
  tiktok: siTiktok,
  twitter: siX,
  whatsapp: siWhatsapp,
  youtube: siYoutube,
} as const satisfies Record<string, SimpleIcon>;

export type Brand = keyof typeof BRANDS;

export function isBrand(value: string): value is Brand {
  return Object.hasOwn(BRANDS, value);
}

/**
 * A brand's mark in the current text colour, 1rem unless `className` sizes
 * it. Decorative: whatever it sits next to, or the link's label, names it.
 */
export default function BrandIcon({
  brand,
  className,
}: {
  brand: Brand;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={cn("size-4 shrink-0", className)}
      aria-hidden="true"
    >
      <path d={BRANDS[brand].path} />
    </svg>
  );
}

type BrandIconComponent = (props: { className?: string }) => React.ReactNode;

function brandComponent(brand: Brand): BrandIconComponent {
  const Component: BrandIconComponent = ({ className }) => (
    <BrandIcon brand={brand} className={className} />
  );
  return Component;
}

/** Each mark as a component of its own, for props that take an icon. */
export const BRAND_ICONS: Record<Brand, BrandIconComponent> = {
  facebook: brandComponent("facebook"),
  instagram: brandComponent("instagram"),
  tiktok: brandComponent("tiktok"),
  twitter: brandComponent("twitter"),
  whatsapp: brandComponent("whatsapp"),
  youtube: brandComponent("youtube"),
};
