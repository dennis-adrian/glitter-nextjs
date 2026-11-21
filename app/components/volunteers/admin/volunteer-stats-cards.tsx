import StatTile from "@/app/components/molecules/stat-tile";
import { cn } from "@/app/lib/utils";
import type { VolunteerAdminCall } from "@/app/lib/volunteers/admin-definitions";

type Totals = VolunteerAdminCall["statusTotals"];

const TILES: { key: keyof Totals; label: string; accent?: boolean }[] = [
  { key: "all", label: "Postulaciones" },
  { key: "pending", label: "Pendientes", accent: true },
  { key: "accepted", label: "Aceptadas" },
  { key: "waitlist", label: "En espera" },
  { key: "rejected", label: "No aceptadas" },
];

/** Tiles shown on phones; the rest only from md up (the status chips carry them). */
const PHONE_TILES = 2;

/**
 * How many applications there are, per status and with no filter. On phones
 * only the total and the pending count show, side by side; the other states
 * are already on the status chips below.
 */
export default function VolunteerStatsCards({ totals }: { totals: Totals }) {
  return (
    <ul
      aria-label="Postulaciones por estado"
      className="grid grid-cols-2 gap-2 md:grid-cols-5 md:gap-3"
    >
      {TILES.map((tile, index) => {
        const value = totals[tile.key];
        return (
          <li
            key={tile.key}
            className={cn("min-w-0", index >= PHONE_TILES && "max-md:hidden")}
          >
            <StatTile
              label={tile.label}
              value={value}
              tone={tile.accent && value > 0 ? "amber" : undefined}
            />
          </li>
        );
      })}
    </ul>
  );
}
