"use client";

import { DateTime } from "luxon";

import { Input } from "@/app/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { formatDate } from "@/app/lib/formatters";

const ALL_SESSIONS = "all";
const ALL_OCCURRENCES = "all";

type Props = {
  sessions: { id: number; title: string }[];
  /** Already scoped to the selected session — empty and disabled otherwise. */
  occurrences: { occurrenceId: number; startsAt: Date }[];
  sessionFilter: number | null;
  occurrenceFilter: number | null;
  search: string;
  onSessionChange: (sessionId: number | null) => void;
  onOccurrenceChange: (occurrenceId: number | null) => void;
  onSearchChange: (value: string) => void;
};

/**
 * The filter selects the grouping level (§5.2): session, then, scoped to it,
 * occurrence. This is one of the two affordances that write to that state —
 * clicking a rollup row's header is the other, and both land on the same
 * `sessionFilter`/`occurrenceFilter` values owned by the parent.
 */
export default function RosterLevelFilters({
  sessions,
  occurrences,
  sessionFilter,
  occurrenceFilter,
  search,
  onSessionChange,
  onOccurrenceChange,
  onSearchChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-full max-w-xs space-y-1">
        <label
          htmlFor="roster-session-filter"
          className="text-xs font-medium text-muted-foreground"
        >
          Sesión
        </label>
        <Select
          value={sessionFilter === null ? ALL_SESSIONS : String(sessionFilter)}
          onValueChange={(value) =>
            onSessionChange(value === ALL_SESSIONS ? null : Number(value))
          }
        >
          <SelectTrigger id="roster-session-filter">
            <SelectValue placeholder="Todas las sesiones" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SESSIONS}>Todas las sesiones</SelectItem>
            {sessions.map((session) => (
              <SelectItem key={session.id} value={String(session.id)}>
                {session.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full max-w-xs space-y-1">
        <label
          htmlFor="roster-occurrence-filter"
          className="text-xs font-medium text-muted-foreground"
        >
          Horario
        </label>
        <Select
          value={
            occurrenceFilter === null ? ALL_OCCURRENCES : String(occurrenceFilter)
          }
          onValueChange={(value) =>
            onOccurrenceChange(value === ALL_OCCURRENCES ? null : Number(value))
          }
          disabled={sessionFilter === null}
        >
          <SelectTrigger id="roster-occurrence-filter">
            <SelectValue placeholder="Todos los horarios" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OCCURRENCES}>Todos los horarios</SelectItem>
            {occurrences.map((occurrence) => (
              <SelectItem
                key={occurrence.occurrenceId}
                value={String(occurrence.occurrenceId)}
              >
                {formatDate(occurrence.startsAt).toLocaleString(
                  DateTime.DATETIME_MED,
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-full max-w-sm flex-1 space-y-1">
        <label
          htmlFor="roster-search-filter"
          className="text-xs font-medium text-muted-foreground"
        >
          Buscar
        </label>
        <Input
          id="roster-search-filter"
          placeholder="Nombre, correo, código o compra…"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>
    </div>
  );
}
