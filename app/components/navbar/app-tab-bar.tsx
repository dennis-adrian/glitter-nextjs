"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ChevronRightIcon } from "lucide-react";

import {
  activeTabKey,
  isFocusedFlowPage,
  isNavLinkActive,
  type NavLink,
} from "@/app/components/navbar/app-navigation";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/app/components/ui/sheet";
import { cn } from "@/app/lib/utils";

/**
 * A tab that holds more than one destination, like Tiendita once the supplies
 * market is open to this person: tapping it asks which one, in a sheet with
 * a row per destination. Picking one closes the sheet and goes there.
 */
function TabChooser({
  tab,
  active,
  className,
  pathname,
  children,
}: {
  tab: NavLink;
  active: boolean;
  className: string;
  pathname: string;
  children: React.ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger
        aria-current={active ? "page" : undefined}
        aria-haspopup="dialog"
        className={className}
      >
        {children}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-brand-border bg-brand-elevated px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-display text-lg text-brand-ink">
            {tab.label}
          </SheetTitle>
          <SheetDescription className="sr-only">
            Elegí a cuál ir
          </SheetDescription>
        </SheetHeader>
        <ul className="mt-3 flex flex-col gap-2">
          {tab.children?.map((child) => {
            const ChildIcon = child.icon;
            const current = isNavLinkActive(child, pathname);
            return (
              <li key={child.key}>
                <SheetClose asChild>
                  <Link
                    href={child.href}
                    aria-current={current ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-card p-3 transition-colors hover:border-brand-primary",
                      current && "border-brand-primary",
                    )}
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-lavender text-brand-primary">
                      <ChildIcon className="size-5" aria-hidden="true" />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-bold text-brand-ink">
                        {child.label}
                      </span>
                      {child.description ? (
                        <span className="text-sm text-brand-neutral">
                          {child.description}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRightIcon
                      className="size-4 shrink-0 text-brand-neutral"
                      aria-hidden="true"
                    />
                  </Link>
                </SheetClose>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

/**
 * The installed app's bottom navigation. It only ever shows in standalone
 * display mode below the desktop breakpoint: in a browser tab the browser's
 * own toolbar already sits at the bottom of the screen, and stacking a second
 * bar on top of it is what this rule avoids. The decision is pure CSS, so the
 * bar is never painted and then removed.
 */
export default function AppTabBar({ tabs }: { tabs: NavLink[] }) {
  const pathname = usePathname() ?? "/";

  if (isFocusedFlowPage(pathname)) return null;

  const activeKey = activeTabKey(tabs, pathname);

  return (
    <nav
      data-app-tabbar=""
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 hidden border-t border-brand-border bg-brand-elevated/95 pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] backdrop-blur standalone:max-lg:block"
    >
      <ul className="mx-auto flex h-16 max-w-xl items-stretch px-2">
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          const Icon = tab.icon;
          const className = cn(
            "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-brand-neutral transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-primary",
            active && "font-semibold text-brand-primary",
          );
          const content = (
            <>
              <span
                className={cn(
                  "flex h-7 w-14 items-center justify-center rounded-full transition-colors",
                  active && "bg-brand-lavender",
                )}
              >
                <Icon className="size-6" aria-hidden="true" />
              </span>
              {tab.label}
            </>
          );

          return (
            <li key={tab.key} className="flex flex-1">
              {tab.children?.length ? (
                <TabChooser
                  tab={tab}
                  active={active}
                  className={className}
                  pathname={pathname}
                >
                  {content}
                </TabChooser>
              ) : (
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={className}
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
