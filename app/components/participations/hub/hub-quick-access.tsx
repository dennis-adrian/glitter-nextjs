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
 * The phone's way into the hub's longer sections, each opening a screen of
 * its own, so the hub itself stays short. On desktop the sections sit on the
 * page instead and this row is not shown.
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
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${shortcuts.length}, minmax(0, 1fr))`,
        }}
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
