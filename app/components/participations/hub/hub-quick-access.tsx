import Link from "next/link";

import {
  AwardIcon,
  ClockIcon,
  LibraryBigIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/app/lib/utils";

export type HubShortcut = {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  /** Shown but not followable until the participation gets there. */
  disabled?: boolean;
};

export const HUB_SECTIONS = {
  team: { label: "Equipo", href: "/my_participations/team", icon: UsersIcon },
  schedule: {
    label: "Horarios",
    href: "/my_participations/schedule",
    icon: ClockIcon,
  },
  activities: {
    label: "Actividades",
    href: "/my_participations/activities",
    icon: AwardIcon,
  },
  programs: {
    label: "Charlas",
    href: "/my_participations/programs",
    icon: LibraryBigIcon,
  },
} as const;

/**
 * Four across or three, whichever leaves no tile alone on the last row: up to
 * four fit one row, seven and eight take four columns, five and six take
 * three.
 */
export function shortcutColumns(count: number): 3 | 4 {
  if (count <= 3) return 3;
  return count % 4 === 0 || count % 4 === 3 ? 4 : 3;
}

/**
 * One grid of shortcuts: on the phone the hub's longer sections (each a screen
 * of its own, so the hub stays short) and, once the stand is confirmed, the
 * reservation's pages; on desktop only the reservation's pages, since the
 * sections sit on the page there.
 */
export default function HubQuickAccess({
  shortcuts,
  className,
}: {
  shortcuts: HubShortcut[];
  className?: string;
}) {
  if (shortcuts.length === 0) return null;

  return (
    <nav aria-label="Accesos directos" className={className}>
      <ul
        className={cn(
          "grid gap-x-1.5 gap-y-3",
          shortcutColumns(shortcuts.length) === 4
            ? "grid-cols-4"
            : "grid-cols-3",
        )}
      >
        {shortcuts.map((shortcut) => {
          const Icon = shortcut.icon;
          const content = (
            <>
              <span className="flex size-12 items-center justify-center rounded-full bg-brand-lavender text-brand-primary">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <span>{shortcut.label}</span>
            </>
          );
          const classes =
            "flex flex-col items-center gap-1.5 py-1 text-center text-xs font-semibold text-brand-ink";

          return (
            <li key={shortcut.key}>
              {shortcut.disabled ? (
                <span
                  aria-disabled="true"
                  title="Disponible cuando tu reserva esté confirmada"
                  className={cn(classes, "opacity-45")}
                >
                  {content}
                </span>
              ) : (
                <Link
                  href={shortcut.href}
                  className={cn(classes, "hover:text-brand-primary")}
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
