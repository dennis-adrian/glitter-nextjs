"use client";

import { MailIcon } from "lucide-react";

import SocialIcon from "@/app/components/social-icon";
import { SITE_CONTACT_EMAIL, SOCIAL_LINKS } from "@/app/lib/site-contact";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

/**
 * The public footer's contact, for the account menus: signed-in screens have
 * no footer, so this is where the email and social links live there.
 */
export default function ContactMenuItems() {
  return (
    <>
      <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground">
        Contacto
      </DropdownMenuLabel>
      <DropdownMenuItem asChild>
        <a href={`mailto:${SITE_CONTACT_EMAIL}`}>
          <MailIcon className="mr-2 size-4" aria-hidden="true" />
          <span>Escribinos</span>
        </a>
      </DropdownMenuItem>
      {SOCIAL_LINKS.map((social) => (
        <DropdownMenuItem key={social.network} asChild>
          <a href={social.href} target="_blank" rel="noopener noreferrer">
            <SocialIcon network={social.network} className="mr-2 size-4" />
            <span>{social.label}</span>
          </a>
        </DropdownMenuItem>
      ))}
    </>
  );
}
