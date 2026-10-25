"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@/app/components/ui/navigation-menu";
import {
  buildPublicNavigation,
  isNavLinkActive,
} from "@/app/components/navbar/app-navigation";
import { cn, isNoNavigationPage } from "@/app/lib/utils";

/**
 * The public site's top navigation, for signed-out visitors on wide screens.
 * Signed in, the desktop sidebar replaces it, admin entries included.
 */
const NavbarNavigationMenu = ({
  programsHref,
  blogEnabled,
}: {
  /** Null when the entry is switched off, gated, or nothing is published. */
  programsHref?: string | null;
  /** False until the `blog` flag is visible to this viewer. */
  blogEnabled?: boolean;
}) => {
  const pathname = usePathname() ?? "/";

  if (isNoNavigationPage(pathname)) {
    return null;
  }

  const links = buildPublicNavigation({ programsHref, blogEnabled });

  return (
    <NavigationMenu>
      <NavigationMenuList>
        {links.map((link) => {
          const Icon = link.icon;
          const active = isNavLinkActive(link, pathname);

          return (
            <NavigationMenuItem key={link.key}>
              <NavigationMenuLink
                asChild
                active={active}
                className={cn(navigationMenuTriggerStyle(), "relative")}
              >
                <Link
                  href={link.href}
                  aria-current={active ? "page" : undefined}
                >
                  <div className="flex items-center">
                    <Icon className="w-4 h-4 mr-1" aria-hidden="true" />
                    {link.label}
                  </div>
                  {link.isNew ? (
                    <>
                      {/* Positioned against the trigger itself, so it sits in
                          the item's own top-right corner and adds no width. */}
                      <span
                        aria-hidden="true"
                        className="absolute right-1.5 top-1.5 size-2 rounded-full bg-primary"
                      />
                      <span className="sr-only">(nuevo)</span>
                    </>
                  ) : null}
                </Link>
              </NavigationMenuLink>
            </NavigationMenuItem>
          );
        })}
      </NavigationMenuList>
    </NavigationMenu>
  );
};

export default NavbarNavigationMenu;
