"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  activeTabKey,
  isFocusedFlowPage,
  type NavLink,
} from "@/app/components/navbar/app-navigation";
import { cn } from "@/app/lib/utils";

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

          return (
            <li key={tab.key} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-brand-neutral transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-primary",
                  active && "font-semibold text-brand-primary",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-14 items-center justify-center rounded-full transition-colors",
                    active && "bg-brand-lavender",
                  )}
                >
                  <Icon className="size-6" aria-hidden="true" />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
