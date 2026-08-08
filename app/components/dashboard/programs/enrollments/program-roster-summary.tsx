import { ROSTER_SEAT_STATE_LABELS, type RosterTotals } from "@/app/lib/programs/roster";
import { cn } from "@/lib/utils";

type Props = {
  totals: RosterTotals;
  showReleased: boolean;
  onToggleReleased: () => void;
};

const TILES: {
  key: "confirmed" | "awaitingReview" | "changesRequested" | "holding" | "released";
  label: string;
}[] = [
  { key: "confirmed", label: ROSTER_SEAT_STATE_LABELS.confirmed },
  { key: "awaitingReview", label: ROSTER_SEAT_STATE_LABELS.awaiting_review },
  { key: "changesRequested", label: ROSTER_SEAT_STATE_LABELS.changes_requested },
  { key: "holding", label: ROSTER_SEAT_STATE_LABELS.holding },
  { key: "released", label: ROSTER_SEAT_STATE_LABELS.released },
];

/**
 * The five state tiles, always for the whole program regardless of the
 * session/occurrence filter (§5.3) — the constant frame of reference the
 * filtered view below is read against.
 *
 * The Liberado tile is the only interactive one: released rows are hidden by
 * default everywhere below, and this tile is the control that reveals them.
 * A hidden state whose count is displayed nowhere else would be a dead end,
 * so the tile that reports the number is the thing you press to see the rows
 * (§5.7).
 */
export default function ProgramRosterSummary({
  totals,
  showReleased,
  onToggleReleased,
}: Props) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
      {TILES.map(({ key, label }) => {
        const value = totals[key];

        if (key !== "released") {
          return (
            <div key={key} className="rounded-lg border border-border/70 p-3">
              <p className="text-2xl font-semibold">{value}</p>
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
          );
        }

        return (
          <button
            key={key}
            type="button"
            onClick={onToggleReleased}
            aria-pressed={showReleased}
            className={cn(
              "rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
              showReleased ? "border-primary bg-muted/30" : "border-border/70",
            )}
          >
            <p className="text-2xl font-semibold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-[11px] font-medium text-primary">
              {showReleased ? "Ocultar filas" : "Mostrar filas"}
            </p>
          </button>
        );
      })}
    </div>
  );
}
