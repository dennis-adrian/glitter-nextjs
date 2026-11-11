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

import SocialIcon from "@/app/components/social-icon";
import WhatsAppIcon from "@/app/icons/WhatsAppIcon";
import YouTubeIcon from "@/app/icons/YoutubeIcon";
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
  if (icon === "instagram" || icon === "tiktok" || icon === "facebook") {
    return <SocialIcon network={icon} className={className} />;
  }
  // Filled marks, unlike the stroked ones above.
  if (icon === "youtube") return <YouTubeIcon className={className} />;
  if (icon === "whatsapp") return <WhatsAppIcon className={className} />;
  const Icon = LUCIDE_ICONS[icon];
  return <Icon className={className} aria-hidden />;
}
