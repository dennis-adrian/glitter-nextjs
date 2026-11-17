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

import BrandIcon, { isBrand } from "@/app/components/brand-icon";
import type { SiteLinkIcon as SiteLinkIconName } from "@/app/lib/links/definitions";

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
