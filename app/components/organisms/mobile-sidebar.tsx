"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { useClerk, useUser } from "@clerk/nextjs";
import { LogOutIcon } from "lucide-react";

import { NavbarProfile } from "@/app/api/users/definitions";
import ThemeImage from "@/app/components/atoms/theme-image";
import { ThemeSegmentedControl } from "@/app/components/mode-toggle";
import {
  buildAppNavigation,
  buildPublicNavigation,
  isNavLinkActive,
  PORTAL_HREF,
  type NavLink,
} from "@/app/components/navbar/app-navigation";
import { forgetThisBrowserForPush } from "@/app/components/notifications/use-push-device";
import { Button } from "@/app/components/ui/button";
import { Separator } from "@/app/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/components/ui/sheet";
import { cn, isNoNavigationPage } from "@/app/lib/utils";

function SheetLink({ link, pathname }: { link: NavLink; pathname: string }) {
  const active = isNavLinkActive(link, pathname);
  const Icon = link.icon;

  return (
    <li>
      <SheetClose asChild>
        <Link
          href={link.href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex w-full items-center gap-3 rounded-xl p-2 text-left text-brand-neutral transition-colors hover:bg-brand-lavender hover:text-brand-primary",
            active && "bg-brand-lavender font-semibold text-brand-primary",
          )}
        >
          <Icon className="h-6 w-6 shrink-0" aria-hidden="true" />
          <span>{link.label}</span>
          {link.isNew ? (
            <>
              {/* Beside the label rather than at the row's far edge: the rows
                  are full-width, so a corner dot would float alone. */}
              <span
                aria-hidden="true"
                className="size-2 shrink-0 self-start rounded-full bg-primary"
              />
              <span className="sr-only">(nuevo)</span>
            </>
          ) : null}
        </Link>
      </SheetClose>
    </li>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="px-2 pb-1 pt-4 text-xs font-bold uppercase tracking-[0.1em] text-brand-neutral">
      {children}
    </h3>
  );
}

type MobileSidebarProps = {
  profile?: NavbarProfile | null;
  /** Null when the entry is switched off, gated, or nothing is published. */
  programsHref?: string | null;
  /** False until the `blog` flag is visible to this viewer. */
  blogEnabled?: boolean;
  /** Hides the wallet entry until credits are revealed. */
  creditsEnabled?: boolean;
  children: React.ReactNode;
};

/**
 * The menu behind the header's hamburger, for phones in a browser tab and for
 * tablets. Signed in, it carries the same groups as the desktop sidebar and
 * the installed app's "Más" page; signed out, the public site's links.
 */
const MobileSidebar = ({
  children,
  profile,
  programsHref = null,
  blogEnabled = false,
  creditsEnabled = false,
}: MobileSidebarProps) => {
  const { signOut } = useClerk();
  const { isSignedIn } = useUser();
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  if (isNoNavigationPage(pathname)) return null;

  const viewer = profile
    ? { role: profile.role, status: profile.status }
    : null;
  const groups = isSignedIn
    ? buildAppNavigation({ viewer, programsHref, blogEnabled, creditsEnabled })
        .groups
    : null;
  const publicLinks = groups
    ? []
    : buildPublicNavigation({ programsHref, blogEnabled });

  return (
    <Sheet>
      <SheetTrigger
        aria-label="Abrir menú de navegación"
        className="cursor-default rounded-full border-brand-border text-brand-ink hover:bg-brand-lavender hover:text-brand-primary"
        variant="outline"
        size="icon"
      >
        {children}
      </SheetTrigger>
      <SheetContent
        side="left"
        className="flex flex-col border-brand-border bg-brand-elevated"
      >
        <SheetHeader>
          <SheetTitle>
            <SheetClose asChild>
              <Link href={isSignedIn ? PORTAL_HREF : "/"}>
                <ThemeImage
                  srcLight="/img/logo/glitter-logo-full-primary-1696x739.png"
                  srcDark="/img/logo/glitter-logo-full-white-1696x741.png"
                  alt="Productora Glitter"
                  width={1696}
                  height={739}
                  className="h-auto w-[120px] object-contain"
                />
              </Link>
            </SheetClose>
          </SheetTitle>
        </SheetHeader>
        <Separator className="my-2" />
        <nav aria-label="Menú" className="flex flex-1 flex-col overflow-y-auto">
          {groups ? (
            groups.map((group) => (
              <div key={group.key}>
                <GroupHeading>{group.label}</GroupHeading>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <SheetLink key={item.key} link={item} pathname={pathname} />
                  ))}
                </ul>
                {group.sections?.map((section) => (
                  <div key={section.key} className="mt-1">
                    <h4 className="flex items-center gap-3 p-2 font-medium text-brand-ink">
                      <section.icon
                        className="h-6 w-6 shrink-0"
                        aria-hidden="true"
                      />
                      {section.label}
                    </h4>
                    <ul className="ml-4 flex flex-col">
                      {section.items.map((item) => (
                        <SheetLink
                          key={item.key}
                          link={item}
                          pathname={pathname}
                        />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <ul className="flex flex-col">
              {publicLinks.map((item) => (
                <SheetLink key={item.key} link={item} pathname={pathname} />
              ))}
            </ul>
          )}
          {isSignedIn && (
            <>
              <Separator className="my-2" />
              <SheetClose asChild>
                <Button
                  className="justify-start p-2"
                  onClick={async () => {
                    await forgetThisBrowserForPush();
                    await signOut(() => router.push("/"));
                  }}
                  variant="ghost"
                >
                  <LogOutIcon className="mr-2 h-6 w-6" aria-hidden="true" />
                  <span className="w-full text-left text-base font-normal">
                    Cerrar Sesión
                  </span>
                </Button>
              </SheetClose>
            </>
          )}
        </nav>
        <div className="flex flex-col gap-2 border-t border-brand-border pt-4">
          <span className="text-sm font-medium text-brand-neutral">Tema</span>
          <ThemeSegmentedControl />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileSidebar;
