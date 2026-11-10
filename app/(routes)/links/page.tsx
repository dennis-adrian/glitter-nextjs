import type { Metadata } from "next";
import { connection } from "next/server";

import GlitterLogo from "@/app/components/landing/glitter-logo";
import SiteLinkCard, {
  SiteSocialLink,
} from "@/app/components/links/site-link-card";
import {
  fetchSocialPosition,
  fetchVisibleSiteLinks,
} from "@/app/lib/links/queries";
import { copyrightNotice } from "@/app/lib/site-contact";
import { cn } from "@/app/lib/utils";

export const metadata: Metadata = {
  title: "Enlaces",
  description:
    "Todos los enlaces de la Productora Glitter: tiendita, sitio web, redes sociales y contacto.",
};

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
  const [all, socialPosition] = await Promise.all([
    fetchVisibleSiteLinks(),
    fetchSocialPosition(),
  ]);
  const socials = all.filter((link) => link.kind === "social");
  const links = all.filter((link) => link.kind !== "social");

  const socialRow =
    socials.length > 0 ? (
      <ul
        aria-label="Redes sociales"
        className={cn(
          "flex flex-wrap items-center justify-center gap-1",
          socialPosition === "top" ? "mt-4" : "mt-6",
        )}
      >
        {socials.map((link) => (
          <li key={link.id}>
            <SiteSocialLink link={link} />
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div
      data-bare-page=""
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center px-4 py-10"
    >
      <GlitterLogo
        variant="dark"
        height={96}
        width={96}
        className="rounded-full"
      />
      <h1 className="mt-4 text-center font-display text-2xl font-bold text-brand-ink">
        Productora Glitter
      </h1>
      <p className="mt-1 text-center text-brand-neutral">
        Productora de festivales para ilustradores, artistas y emprendimientos
        creativos
      </p>
      {socialPosition === "top" ? socialRow : null}
      <ul
        className={
          socialPosition === "top" && socialRow
            ? "mt-6 flex w-full flex-col gap-3"
            : "mt-8 flex w-full flex-col gap-3"
        }
      >
        {links.map((link) => (
          <li key={link.id}>
            <SiteLinkCard link={link} />
          </li>
        ))}
      </ul>
      {socialPosition === "bottom" ? socialRow : null}
      <p className="mt-auto pt-10 text-center text-xs text-brand-neutral">
        {copyrightNotice()}
      </p>
    </div>
  );
}
