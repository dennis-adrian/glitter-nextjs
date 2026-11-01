"use client";

import Link from "next/link";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { useScreenPlacement } from "@/app/components/navbar/screen-bar";
import { breadcrumbTrail } from "@/app/components/navbar/screens";
import { cn } from "@/app/lib/utils";

/**
 * The one breadcrumb for every page below a tab's own page, in a browser
 * tab. Desktops get the whole trail; phones only the level above, which is
 * all that fits; the installed app none, since its top bar already has back
 * and the title. The trail comes from the same list as that bar, so the two
 * never disagree.
 *
 * Pass the names that depend on data for the levels above (by href), e.g.
 * `{ "/dashboard/festivals/9": festival.name }`; the page's own name comes
 * from its ScreenTitle, or its generic title.
 */
export default function PageBreadcrumbs({
  labels,
  current,
  className,
}: {
  labels?: Record<string, string>;
  /** The page's own crumb, when it should differ from the bar's title. */
  current?: string;
  className?: string;
}) {
  const { nav, path, title, parentHref, isRoot } = useScreenPlacement();
  const trail = nav
    ? breadcrumbTrail(path, nav, {
        labels,
        current: current ?? title,
        parentHref,
      })
    : [];

  // Until the navbar has streamed in, keep the line so nothing moves.
  if (!nav) return <div className={cn("h-5", className)} aria-hidden="true" />;
  if (isRoot || trail.length < 2) return null;

  const parent = trail[trail.length - 2];
  const here = trail[trail.length - 1];

  return (
    <nav
      aria-label="Ruta"
      data-installed-hidden=""
      className={cn("min-h-5 text-sm", className)}
    >
      <Link
        href={parent.href}
        className="inline-flex items-center gap-1 font-medium text-brand-primary hover:underline md:hidden"
      >
        <ChevronLeftIcon className="size-4" aria-hidden="true" />
        {parent.label}
      </Link>
      <ol className="hidden flex-wrap items-center gap-1.5 text-brand-neutral md:flex">
        {trail.slice(0, -1).map((crumb) => (
          <li key={crumb.href} className="inline-flex items-center gap-1.5">
            <Link
              href={crumb.href}
              className="font-medium text-brand-primary hover:underline"
            >
              {crumb.label}
            </Link>
            <ChevronRightIcon
              className="size-3.5 text-brand-neutral"
              aria-hidden="true"
            />
          </li>
        ))}
        <li>
          <span aria-current="page" className="text-brand-ink">
            {here.label}
          </span>
        </li>
      </ol>
    </nav>
  );
}
