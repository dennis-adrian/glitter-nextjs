"use client";

import { DateTime } from "luxon";
import { useState } from "react";

import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { formatDate } from "@/app/lib/formatters";
import {
  CHECK_IN_OUTCOME_LABELS,
  isCheckInAccepted,
  type CheckInResult,
} from "@/app/lib/programs/checkin";

/**
 * How many scans the list shows before it has to be asked for more.
 *
 * The common question is "did that one go through", which the last handful
 * answers. Anything longer is a different question, and one the operator should
 * have to ask for rather than scroll past on every glance.
 */
const COLLAPSED_LIMIT = 5;

export type RecentCheckIn = {
  /** Monotonic per session; scans of different tickets can share a second. */
  id: number;
  at: Date;
  result: CheckInResult;
};

type Props = {
  items: RecentCheckIn[];
  onClear: () => void;
};

function subject(result: CheckInResult): string {
  switch (result.outcome) {
    case "checked_in":
    case "already_used":
    case "cancelled":
      return result.attendeeName;
    case "wrong_occurrence":
      return result.sessionTitle;
    default:
      return "—";
  }
}

/**
 * The last few scans, held in client state rather than re-read from the server.
 *
 * A door works in bursts and the operator's question is "did that one go
 * through" — a round trip per scan to re-render a table would put a spinner
 * between them and the answer. The authoritative list is the occurrence
 * roster, one click away.
 */
export default function CheckInRecentList({ items, onClear }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no escaneaste ninguna entrada.
      </p>
    );
  }

  const hidden = items.length - COLLAPSED_LIMIT;
  const visible = expanded ? items : items.slice(0, COLLAPSED_LIMIT);

  return (
    <div className="space-y-3">
      <ul className="divide-y">
        {visible.map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 py-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {subject(item.result)}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDate(item.at).toLocaleString(DateTime.TIME_WITH_SECONDS)}
              </p>
            </div>
            <Badge
              variant={
                isCheckInAccepted(item.result.outcome)
                  ? "green"
                  : item.result.outcome === "already_used"
                    ? "amber"
                    : "red"
              }
            >
              {CHECK_IN_OUTCOME_LABELS[item.result.outcome]}
            </Badge>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2">
        {hidden > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-2"
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? "Mostrar menos" : `Mostrar más (${hidden})`}
          </Button>
        ) : (
          // Keeps "Limpiar" on the right whether or not there is a toggle.
          <span />
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2 text-muted-foreground"
          onClick={onClear}
        >
          Limpiar
        </Button>
      </div>
    </div>
  );
}
