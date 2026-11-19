import type { Metadata } from "next";

import LinksPageView from "@/app/components/links/links-page-view";
import { getEnvLabel } from "@/app/lib/config";
import { linksPageMetadata } from "@/app/lib/links/metadata";
import { fetchLinksPage } from "@/app/lib/links/queries";

/*
 * Served from the cache, not built per visit. A change saved in
 * `/dashboard/links` expires the page and its rows at once; this lifetime is
 * what puts a scheduled link on (or takes it off) the page within about half
 * a minute of its time: the first visit after it gets the page as it was and
 * rebuilds it, the next gets the new one.
 */
export const revalidate = 30;

/** The header the dashboard set names the page, here and when it is shared. */
export async function generateMetadata(): Promise<Metadata> {
  const { header } = await fetchLinksPage();
  return linksPageMetadata(header, getEnvLabel());
}

/**
 * Glitter's link-in-bio page: the one address its social profiles show, in
 * place of a Linktree. Its links are managed from `/dashboard/links`.
 *
 * It sits outside the `(site)` group on purpose: no site header, app shell or
 * footer is rendered or queried for it, so it loads fast and reads as a page
 * of its own from Instagram's in-app browser.
 */
export default async function LinksPage() {
  const { links, socialPosition, header } = await fetchLinksPage();
  return (
    <LinksPageView
      links={links}
      socialPosition={socialPosition}
      header={header}
      className="min-h-dvh"
    />
  );
}
