import { ChevronRightIcon, ExternalLinkIcon, MailIcon } from "lucide-react";

import SocialIcon from "@/app/components/social-icon";
import { SITE_CONTACT_EMAIL, SOCIAL_LINKS } from "@/app/lib/site-contact";

/** A row that leaves the app: an email or a social network. */
function ExternalRow({
  href,
  label,
  description,
  icon,
}: {
  href: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
}) {
  const isMail = href.startsWith("mailto:");

  return (
    <li className="border-b border-brand-border last:border-b-0">
      <a
        href={href}
        {...(isMail ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        className="flex min-h-12 items-center gap-3 px-1 py-2 text-[15px] font-medium text-brand-ink hover:text-brand-primary"
      >
        {icon}
        <span className="flex min-w-0 flex-1 flex-col">
          <span>{label}</span>
          {description ? (
            <span className="text-xs font-normal text-brand-neutral wrap-anywhere">
              {description}
            </span>
          ) : null}
        </span>
        {isMail ? (
          <ChevronRightIcon
            className="size-4 shrink-0 text-brand-neutral"
            aria-hidden="true"
          />
        ) : (
          <>
            <ExternalLinkIcon
              className="size-4 shrink-0 text-brand-neutral"
              aria-hidden="true"
            />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </>
        )}
      </a>
    </li>
  );
}

/**
 * The site footer's contact for signed-in screens, which have no footer: the
 * email and the social networks. Más lists it, and `/contacto` shows it to
 * the sidebar and the phone menu.
 */
export default function ContactList() {
  return (
    <ul>
      <ExternalRow
        href={`mailto:${SITE_CONTACT_EMAIL}`}
        label="Escribinos"
        description={SITE_CONTACT_EMAIL}
        icon={<MailIcon className="size-5 shrink-0" aria-hidden="true" />}
      />
      {SOCIAL_LINKS.map((social) => (
        <ExternalRow
          key={social.network}
          href={social.href}
          label={social.label}
          icon={
            <SocialIcon network={social.network} className="size-5 shrink-0" />
          }
        />
      ))}
    </ul>
  );
}
