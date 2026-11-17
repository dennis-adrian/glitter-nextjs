import GlitterLogo from "@/app/components/landing/glitter-logo";
import SiteLinkCard, {
  SiteSocialLink,
} from "@/app/components/links/site-link-card";
import type {
  PublicSiteLink,
  SocialPosition,
} from "@/app/lib/links/definitions";
import { copyrightNotice } from "@/app/lib/site-contact";
import { cn } from "@/app/lib/utils";

/**
 * What `/links` shows, from the logo to the copyright line. The public page
 * renders it as the whole screen; `/dashboard/links` renders it again as the
 * preview (`preview`), where a tap opens the link without counting as a click
 * and the title is not a second `h1` of the dashboard page.
 */
export default function LinksPageView({
  links: all,
  socialPosition,
  preview = false,
  className,
}: {
  /** The visible links and social icons, each kind already in order. */
  links: PublicSiteLink[];
  socialPosition: SocialPosition;
  preview?: boolean;
  className?: string;
}) {
  const socials = all.filter((link) => link.kind === "social");
  const links = all.filter((link) => link.kind !== "social");
  const Title = preview ? "p" : "h1";

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
            <SiteSocialLink link={link} preview={preview} />
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-md flex-col items-center px-4 py-10",
        className,
      )}
    >
      <GlitterLogo
        variant="dark"
        height={96}
        width={96}
        className="rounded-full"
      />
      <Title className="mt-4 text-center font-display text-2xl font-bold text-brand-ink">
        Productora Glitter
      </Title>
      <p className="mt-1 text-center text-brand-neutral">
        Productora de festivales para ilustradores, artistas y emprendimientos
        creativos
      </p>
      {socialPosition === "top" ? socialRow : null}
      <ul
        className={cn(
          "flex w-full flex-col gap-3",
          socialPosition === "top" && socialRow ? "mt-6" : "mt-8",
        )}
      >
        {links.map((link) => (
          <li key={link.id}>
            <SiteLinkCard link={link} preview={preview} />
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
