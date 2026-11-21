import { Card, CardContent } from "@/app/components/ui/card";
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
        const highlighted = tile.accent && value > 0;
        return (
          <li
            key={tile.key}
            className={cn("min-w-0", index === 0 && "col-span-2 sm:col-span-1")}
          >
            <Card
              className={cn(
                "h-full",
                highlighted && "border-amber-300 dark:border-amber-800",
              )}
            >
              <CardContent className="flex flex-col gap-0.5 p-3">
                <span className="text-[11px] font-medium tracking-wide break-words text-muted-foreground uppercase">
                  {tile.label}
                </span>
                <span
                  className={cn(
                    "font-display text-2xl leading-tight font-semibold tabular-nums",
                    highlighted && "text-amber-700 dark:text-amber-400",
                  )}
                >
                  {value}
                </span>
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
