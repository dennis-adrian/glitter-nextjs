"use client";

import Image from "next/image";
import Link from "next/link";

import SiteLinkIcon, {
  SiteLinkThumb,
} from "@/app/components/links/site-link-icon";
import {
  isExternalLink,
  isFeaturedCard,
  mailtoAddress,
  thumbnailMode,
  toSiteLinkIcon,
  type PublicSiteLink,
} from "@/app/lib/links/definitions";
import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import { cn } from "@/app/lib/utils";

/** What every card shares: its surface, its border and how it answers. */
const CARD_SURFACE_CLASS =
  "border border-brand-border bg-brand-card text-brand-ink shadow-xs transition hover:border-brand-primary hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary";

const CARD_CLASS = `flex min-h-16 w-full items-center gap-3 rounded-xl px-4 py-3 ${CARD_SURFACE_CLASS}`;

/** The image large, the title under it. */
const FEATURED_CARD_CLASS = `flex w-full flex-col gap-2 rounded-xl p-2 ${CARD_SURFACE_CLASS}`;

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
export function SiteSocialLink({
  link,
  preview = false,
}: {
  link: PublicSiteLink;
  /** In the dashboard's preview: the tap opens the link and is not counted. */
  preview?: boolean;
}) {
  const isMail = mailtoAddress(link.href) != null;
  return (
    <a
      href={link.href}
      aria-label={link.label}
      title={link.label}
      onClick={preview ? undefined : () => recordClick(link)}
      className="flex size-11 items-center justify-center rounded-full text-brand-ink transition hover:bg-brand-lavender hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary dark:hover:bg-brand-deep dark:hover:text-brand-ink"
      {...(isMail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
    >
      <SiteLinkIcon icon={toSiteLinkIcon(link.icon)} className="h-7 w-7" />
    </a>
  );
}

/** One link of the `/links` page. */
export default function SiteLinkCard({
  link,
  preview = false,
}: {
  link: PublicSiteLink;
  /**
   * In the dashboard's preview: the tap is not counted, and a path of this
   * site opens in a new tab too, so the editor stays where it is.
   */
  preview?: boolean;
}) {
  const email = mailtoAddress(link.href);
  const thumbnail = thumbnailMode(link);
  const featured = isFeaturedCard(link);
  const cardClass = featured ? FEATURED_CARD_CLASS : CARD_CLASS;
  const content = featured ? (
    <>
      {/* Wide enough for a 430px phone at twice its pixels. */}
      <Image
        src={link.imageUrl!}
        alt=""
        width={832}
        height={468}
        sizes="(min-width: 448px) 416px, calc(100vw - 2rem)"
        className="aspect-video w-full rounded-lg object-cover"
      />
      <span className="block px-2 py-1 text-center">
        <span className="block font-semibold break-words">{link.label}</span>
        {email ? (
          <span className="block text-sm text-brand-neutral wrap-anywhere">
            {email}
          </span>
        ) : null}
      </span>
    </>
  ) : (
    <>
      <SiteLinkThumb
        link={link}
        className="h-6 w-6 shrink-0"
        imageClassName="size-10"
      />
      {/* Centred on the card, not on the space the thumbnail leaves: the
          right padding matches the thumbnail and its gap. */}
      <span
        className={cn(
          "min-w-0 flex-1 text-center",
          thumbnail === "image" && "pr-[3.25rem]",
          thumbnail === "icon" && "pr-9",
        )}
      >
        <span className="block font-semibold break-words">{link.label}</span>
        {email ? (
          <span className="block text-sm text-brand-neutral wrap-anywhere">
            {email}
          </span>
        ) : null}
      </span>
    </>
  );

  if (preview || isExternalLink(link.href)) {
    return (
      <a
        href={link.href}
        className={cardClass}
        onClick={preview ? undefined : () => recordClick(link)}
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
      className={cardClass}
      onClick={() => recordClick(link)}
    >
      {content}
    </Link>
  );
}
