import type { Metadata } from "next";
import { connection } from "next/server";

import LinksPageView from "@/app/components/links/links-page-view";
import {
  fetchLinksSettings,
  fetchVisibleSiteLinks,
} from "@/app/lib/links/queries";

/** The header the dashboard set names the page, here and when it is shared. */
export async function generateMetadata(): Promise<Metadata> {
  const { header } = await fetchLinksSettings();
  return {
    title: header.title,
    description:
      header.description ||
      "Todos los enlaces de la Productora Glitter: tiendita, sitio web, redes sociales y contacto.",
  };
}

/**
 * Glitter's link-in-bio page: the one address its social profiles show, in
 * place of a Linktree. Its links are managed from `/dashboard/links`.
 *
 * Bare on purpose: `data-bare-page` takes the site header, the app shell and
 * the footer off it (app/globals.css, app/components/footer.tsx), so it reads
 * as a page of its own from Instagram's in-app browser.
 */
export default async function LinksPage() {
  // Read per request: a link added in the dashboard is live at once.
  await connection();
  const [links, { socialPosition, header }] = await Promise.all([
    fetchVisibleSiteLinks(),
    fetchLinksSettings(),
  ]);
  return (
    <div data-bare-page="">
      <LinksPageView
        links={links}
        socialPosition={socialPosition}
        header={header}
        className="min-h-dvh"
      />
    </div>
  );
}
