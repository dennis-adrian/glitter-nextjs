import {
  CalendarIcon,
  GlobeIcon,
  HeartIcon,
  LinkIcon,
  MailIcon,
  ShoppingCartIcon,
  SparklesIcon,
  TicketIcon,
} from "lucide-react";

import Image from "next/image";

import BrandIcon, { isBrand } from "@/app/components/brand-icon";
import {
  NO_ICON,
  isSafeIconSvg,
  parseLibraryIcon,
  toSiteLinkIcon,
  type PublicSiteLink,
  type SiteLinkIcon as SiteLinkIconName,
} from "@/app/lib/links/definitions";
import { cn } from "@/app/lib/utils";

const LUCIDE_ICONS = {
  link: LinkIcon,
  sparkles: SparklesIcon,
  store: ShoppingCartIcon,
  website: GlobeIcon,
  ticket: TicketIcon,
  calendar: CalendarIcon,
  heart: HeartIcon,
  email: MailIcon,
} as const;

/** The icon a link was given in the dashboard. Decorative: the label names it. */
export default function SiteLinkIcon({
  icon,
  className,
}: {
  icon: SiteLinkIconName;
  className?: string;
}) {
  // A network's own mark (Simple Icons): filled, unlike the stroked ones.
  if (isBrand(icon)) return <BrandIcon brand={icon} className={className} />;
  const Icon = LUCIDE_ICONS[icon];
  return <Icon className={className} aria-hidden />;
}

/**
 * What a link shows beside its title: its image, the icon picked for it, or
 * nothing. `className` sizes an icon; an image takes `imageClassName`.
 *
 * A library icon is drawn from the markup stored with the link. That markup
 * is built on the server from the icon libraries' own data
 * (`libraryIconSvg`), never from anything a person typed, and is checked
 * again here (`isSafeIconSvg`) before it is put in the page.
 */
export function SiteLinkThumb({
  link,
  className,
  imageClassName,
}: {
  link: Pick<PublicSiteLink, "icon" | "iconSvg" | "imageUrl">;
  className?: string;
  imageClassName?: string;
}) {
  if (link.imageUrl) {
    return (
      <Image
        src={link.imageUrl}
        alt=""
        width={80}
        height={80}
        className={cn("shrink-0 rounded-md object-cover", imageClassName)}
      />
    );
  }
  if (link.icon === NO_ICON) return null;
  // Markup goes in the page only if it is a plain drawing; anything else is
  // shown as the link icon below.
  if (parseLibraryIcon(link.icon) && isSafeIconSvg(link.iconSvg)) {
    return (
      <span
        aria-hidden
        className={cn("inline-flex [&>svg]:size-full", className)}
        dangerouslySetInnerHTML={{ __html: link.iconSvg }}
      />
    );
  }
  return (
    <SiteLinkIcon icon={toSiteLinkIcon(link.icon)} className={className} />
  );
}
