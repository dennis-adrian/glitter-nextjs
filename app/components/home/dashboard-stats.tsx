import Link from "next/link";

import type { DashboardStat } from "@/app/lib/home/dashboard";
import { cn } from "@/app/lib/utils";

// Whole class names, so Tailwind sees each one.
const PHONE_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
};
const DESKTOP_COLUMNS: Record<number, string> = {
  1: "lg:grid-cols-1",
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

/**
 * The home's figures at a glance, each a way into its own page: credits,
 * orders, talk enrollments and, on desktop, the days to the festival.
 */
export default function DashboardStats({ stats }: { stats: DashboardStat[] }) {
  if (stats.length === 0) return null;
  const phoneCount = stats.filter((stat) => !stat.desktopOnly).length;

  return (
    <ul
      aria-label="Resumen"
      className={cn(
        "grid gap-2 md:gap-3",
        PHONE_COLUMNS[Math.min(phoneCount, 3)],
        DESKTOP_COLUMNS[Math.min(stats.length, 4)],
      )}
    >
      {stats.map((stat) => (
        <li
          key={stat.key}
          className={cn("min-w-0", stat.desktopOnly && "hidden lg:block")}
        >
          <Link
            href={stat.href}
            className="flex h-full flex-col gap-0.5 rounded-2xl border border-brand-border bg-brand-card p-3 transition-colors hover:border-brand-primary md:p-4"
          >
            <span className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-brand-neutral">
              {stat.label}
            </span>
            <span className="truncate font-display text-xl font-bold leading-tight text-brand-ink tabular-nums md:text-2xl">
              {stat.value}
            </span>
            <span className="truncate text-xs text-brand-neutral">
              {stat.caption}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
