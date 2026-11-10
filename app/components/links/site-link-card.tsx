"use client";

import Link from "next/link";

import SiteLinkIcon from "@/app/components/links/site-link-icon";
import {
  isExternalLink,
  mailtoAddress,
  toSiteLinkIcon,
  type PublicSiteLink,
} from "@/app/lib/links/definitions";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";

const CARD_CLASS =
  "flex min-h-16 w-full items-center gap-3 rounded-xl border border-brand-border bg-brand-card px-4 py-3 text-brand-ink shadow-xs transition hover:border-brand-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

/**
 * Counts the tap without holding up the visitor: a beacon outlives the page
 * they are leaving, and nothing waits for its answer.
 */
function recordClick(link: PublicSiteLink) {
  try {
    navigator.sendBeacon(`/api/links/${link.id}/click`);
  } catch {
    // Counting is best-effort; the link still opens.
  }
  captureClientEvent(POSTHOG_EVENTS.SITE_LINK_CLICKED, {
    link_id: link.id,
    link_kind: link.kind,
    link_label: link.label,
    link_href: link.href,
  });
}

/**
 * One network of the row of social icons: the mark alone, named for screen
 * readers by its network.
 */
export function SiteSocialLink({ link }: { link: PublicSiteLink }) {
  const isMail = mailtoAddress(link.href) != null;
  return (
    <a
      href={link.href}
      aria-label={link.label}
      title={link.label}
      onClick={() => recordClick(link)}
      className="flex size-11 items-center justify-center rounded-full text-brand-ink transition hover:bg-brand-lavender hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary dark:hover:bg-brand-deep dark:hover:text-brand-ink"
      {...(isMail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
    >
      <SiteLinkIcon icon={toSiteLinkIcon(link.icon)} className="h-7 w-7" />
    </a>
  );
}

/** One link of the `/links` page. */
export default function SiteLinkCard({ link }: { link: PublicSiteLink }) {
  const email = mailtoAddress(link.href);
  const content = (
    <>
      <SiteLinkIcon
        icon={toSiteLinkIcon(link.icon)}
        className="h-6 w-6 shrink-0"
      />
      {/* Centred on the card, not on the space the icon leaves: the right
          padding matches the icon and its gap. */}
      <span className="min-w-0 flex-1 pr-9 text-center">
        <span className="block font-semibold break-words">{link.label}</span>
        {email ? (
          <span className="block text-sm text-brand-neutral wrap-anywhere">
            {email}
          </span>
        ) : null}
      </span>
    </>
  );

  if (isExternalLink(link.href)) {
    return (
      <a
        href={link.href}
        className={CARD_CLASS}
        onClick={() => recordClick(link)}
        // A mailto opens the mail app; a new tab for it would stay blank.
        {...(email == null
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
      >
        {content}
      </a>
    );
  }

  return (
    <Link
      href={link.href}
      className={CARD_CLASS}
      onClick={() => recordClick(link)}
    >
      {content}
    </Link>
  );
}
