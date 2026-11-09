"use client";

import Link from "next/link";
import { useState } from "react";

import { CircleHelpIcon, DownloadIcon, MailIcon } from "lucide-react";

import SocialIcon from "@/app/components/social-icon";
import { INSTALL_GUIDE_PATH } from "@/app/lib/install-guide/definitions";
import { SITE_CONTACT_EMAIL, SOCIAL_LINKS } from "@/app/lib/site-contact";
import { cn } from "@/app/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/ui/popover";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";

/**
 * "Ayuda" is where signed-in screens, which have no site footer, keep its
 * contact: the email and the social networks, plus the install guide. It sits
 * at the foot of the navigation, the way app-style products keep Help apart
 * from their destinations: a popover from the desktop sidebar, a bottom sheet
 * from the phone menu, and a card in the installed app's Más.
 */
export const HELP_LABEL = "Ayuda";

function HelpRow({
  href,
  icon,
  label,
  description,
  onNavigate,
  className,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  onNavigate?: () => void;
  className?: string;
}) {
  const content = (
    <>
      {icon}
      <span className="flex min-w-0 flex-col">
        <span className="font-semibold">{label}</span>
        <span className="text-xs text-brand-neutral wrap-anywhere">
          {description}
        </span>
      </span>
    </>
  );
  const rowClass = cn(
    "flex min-h-12 items-center gap-3 rounded-lg px-3 py-2 text-brand-ink transition-colors hover:bg-brand-lavender hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
    className,
  );

  return href.startsWith("mailto:") ? (
    <a href={href} className={rowClass} onClick={onNavigate}>
      {content}
    </a>
  ) : (
    <Link href={href} className={rowClass} onClick={onNavigate}>
      {content}
    </Link>
  );
}

/** "Seguinos" and the three networks, as icon buttons. */
export function HelpSocialLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <span className="text-sm text-brand-neutral">Seguinos</span>
      <ul className="flex gap-2">
        {SOCIAL_LINKS.map((social) => (
          <li key={social.network}>
            <a
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${social.label} (se abre en otra pestaña)`}
              onClick={onNavigate}
              className="inline-flex size-11 items-center justify-center rounded-full border border-brand-border bg-brand-card text-brand-ink transition-colors hover:bg-brand-lavender hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              <SocialIcon network={social.network} className="size-5" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The email row: the one way to write to Glitter. */
export function HelpEmailRow({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <HelpRow
      href={`mailto:${SITE_CONTACT_EMAIL}`}
      icon={<MailIcon className="size-5 shrink-0" aria-hidden="true" />}
      label="Escribinos"
      description={SITE_CONTACT_EMAIL}
      onNavigate={onNavigate}
      className={className}
    />
  );
}

/**
 * What the popover and the bottom sheet hold. `onNavigate` closes whichever
 * holds it once a link is followed, a new tab included.
 */
export function HelpContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col gap-0.5">
      <HelpEmailRow onNavigate={onNavigate} />
      {/* Not inside the installed app: it is already installed. */}
      <HelpRow
        href={INSTALL_GUIDE_PATH}
        icon={<DownloadIcon className="size-5 shrink-0" aria-hidden="true" />}
        label="Instalá la app"
        description="Glitter en la pantalla de tu teléfono"
        onNavigate={onNavigate}
        className="standalone:hidden"
      />
      <div className="mx-1 my-1.5 h-px bg-brand-border" />
      <HelpSocialLinks onNavigate={onNavigate} className="px-3 pb-1 pt-1" />
    </div>
  );
}

/** The desktop sidebar's "Ayuda": an entry at its foot that opens a popover. */
export function SidebarHelp({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        title={collapsed ? HELP_LABEL : undefined}
        className={cn(
          "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-brand-ink transition-colors hover:bg-brand-lavender hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary data-[state=open]:bg-brand-lavender data-[state=open]:font-semibold data-[state=open]:text-brand-primary",
          collapsed && "justify-center px-0",
        )}
      >
        <CircleHelpIcon className="size-5 shrink-0" aria-hidden="true" />
        <span className={cn("truncate", collapsed && "sr-only")}>
          {HELP_LABEL}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="end"
        sideOffset={12}
        aria-label={HELP_LABEL}
        className="w-76 rounded-xl border-brand-border p-2"
      >
        <p className="px-3 pb-1.5 pt-2 font-display text-base font-bold text-brand-ink">
          {HELP_LABEL}
        </p>
        <HelpContent onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

/** The phone menu's "Ayuda", as a bottom sheet. */
export function HelpDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="bg-brand-elevated">
        <div className="mx-auto flex w-full max-w-md flex-col gap-2 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
          <DrawerHeader className="px-0 text-left">
            <DrawerTitle className="font-display text-xl text-brand-ink">
              {HELP_LABEL}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Escribinos, instalá la app o seguinos en redes.
            </DrawerDescription>
          </DrawerHeader>
          <div className="rounded-2xl border border-brand-border bg-brand-card p-1.5">
            <HelpContent onNavigate={() => onOpenChange(false)} />
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
