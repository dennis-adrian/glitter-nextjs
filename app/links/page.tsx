import type { Metadata } from "next";
import { connection } from "next/server";

import LinksPageView from "@/app/components/links/links-page-view";
import { getEnvLabel } from "@/app/lib/config";
import { linksPageMetadata } from "@/app/lib/links/metadata";
import { fetchLinksPage } from "@/app/lib/links/queries";

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
  // Rendered for each visit, so a scheduled link comes and goes at its
  // time even after a quiet spell (a cached page would show the last
  // visitor's links to the next one). The rows themselves come from the
  // cache, expired by every dashboard write, so a visit reads no database.
  await connection();
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
