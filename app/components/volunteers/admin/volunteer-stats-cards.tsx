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

/**
 * How many applications there are, per status and with no filter. On phones
 * the total takes the whole first row and the four states sit two by two.
 */
export default function VolunteerStatsCards({ totals }: { totals: Totals }) {
  return (
    <ul
      aria-label="Postulaciones por estado"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 md:gap-3"
    >
      {TILES.map((tile, index) => {
        const value = totals[tile.key];
        return (
          <li
            key={tile.key}
            className={cn("min-w-0", index === 0 && "col-span-2 sm:col-span-1")}
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
