"use client";

import { DateTime } from "luxon";
import { useMemo, useState } from "react";

import OccurrenceRollupRow from "@/app/components/dashboard/programs/enrollments/occurrence-rollup-row";
import ProgramRosterSummary from "@/app/components/dashboard/programs/enrollments/program-roster-summary";
import RosterLevelFilters from "@/app/components/dashboard/programs/enrollments/roster-level-filters";
import SessionRollupRow from "@/app/components/dashboard/programs/enrollments/session-rollup-row";
import OccurrenceRosterTable, {
  type RosterOccurrenceContext,
} from "@/app/components/dashboard/programs/occurrence-roster-table";
import { formatDate } from "@/app/lib/formatters";
import type { ProgramRoster } from "@/app/lib/programs/occurrence-queries";
import {
  buildOccurrenceRollups,
  buildSessionRollups,
  groupEntriesByOccurrence,
  matchesRosterSearch,
  type OccurrenceRollup,
} from "@/app/lib/programs/program-roster";
import { summarizeRoster } from "@/app/lib/programs/roster";

type Props = {
  roster: ProgramRoster;
};

/**
 * Owns every piece of client state for the program enrollments dashboard —
 * filter, search, and the released-rows toggle — and does all grouping over
 * `roster.entries` via `summarizeRoster`/`buildOccurrenceRollups`/
 * `buildSessionRollups` (invariant 3: one load, so a group's count and its
 * expanded contents can never diverge).
 *
 * State lives here rather than in the URL: the load-all approach exists to
 * make filtering instant, and re-running a server component on every click
 * would spend exactly the benefit it was chosen for (§7.4).
 */
export default function ProgramRosterView({ roster }: Props) {
  const [sessionFilter, setSessionFilter] = useState<number | null>(null);
  const [occurrenceFilter, setOccurrenceFilter] = useState<number | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [showReleased, setShowReleased] = useState(false);

  // A stale occurrence id from another session must never survive a session
  // change (§5.2).
  function handleSessionChange(sessionId: number | null) {
    setSessionFilter(sessionId);
    setOccurrenceFilter(null);
  }

  const entriesByOccurrenceId = useMemo(
    () => groupEntriesByOccurrence(roster.entries),
    [roster.entries],
  );

  const occurrenceRollups = useMemo(
    () =>
      buildOccurrenceRollups(
        roster.occurrences,
        roster.entries,
        roster.waitlistByOccurrence,
      ),
    [roster.occurrences, roster.entries, roster.waitlistByOccurrence],
  );

  const sessionRollups = useMemo(
    () => buildSessionRollups(roster.sessions, occurrenceRollups),
    [roster.sessions, occurrenceRollups],
  );

  const occurrenceRollupsBySession = useMemo(() => {
    const map = new Map<number, OccurrenceRollup[]>();
    for (const rollup of occurrenceRollups) {
      const group = map.get(rollup.sessionId);
      if (group) {
        group.push(rollup);
      } else {
        map.set(rollup.sessionId, [rollup]);
      }
    }
    return map;
  }, [occurrenceRollups]);

  const occurrenceContext = useMemo<RosterOccurrenceContext>(() => {
    const sessionTitleById = new Map(
      roster.sessions.map((session) => [session.id, session.title]),
    );
    const context: RosterOccurrenceContext = new Map();
    for (const occurrence of roster.occurrences) {
      context.set(occurrence.occurrenceId, {
        sessionTitle: sessionTitleById.get(occurrence.sessionId) ?? "—",
        occurrenceLabel: formatDate(occurrence.startsAt).toLocaleString(
          DateTime.DATETIME_MED,
        ),
      });
    }
    return context;
  }, [roster.sessions, roster.occurrences]);

  const tileTotals = useMemo(
    () => summarizeRoster(roster.entries.map((entry) => entry.state)),
    [roster.entries],
  );

  const isSearching = search.trim().length > 0;

  // Session/occurrence filters still scope a search (§5.8).
  const scopedEntries = useMemo(() => {
    if (occurrenceFilter !== null) {
      return roster.entries.filter(
        (entry) => entry.occurrenceId === occurrenceFilter,
      );
    }
    if (sessionFilter !== null) {
      const occurrenceIdsInSession = new Set(
        roster.occurrences
          .filter((occurrence) => occurrence.sessionId === sessionFilter)
          .map((occurrence) => occurrence.occurrenceId),
      );
      return roster.entries.filter((entry) =>
        occurrenceIdsInSession.has(entry.occurrenceId),
      );
    }
    return roster.entries;
  }, [roster.entries, roster.occurrences, sessionFilter, occurrenceFilter]);

  // Search spans every state, including released, regardless of the toggle
  // (§5.8) — a support request about a dead checkout is exactly when someone
  // needs to be findable.
  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    return scopedEntries.filter((entry) => matchesRosterSearch(entry, search));
  }, [scopedEntries, search, isSearching]);

  const occurrenceOptions = useMemo(() => {
    if (sessionFilter === null) return [];
    return roster.occurrences
      .filter((occurrence) => occurrence.sessionId === sessionFilter)
      .slice()
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  }, [roster.occurrences, sessionFilter]);

  const selectedSessionRollup =
    sessionFilter !== null
      ? (sessionRollups.find((rollup) => rollup.sessionId === sessionFilter) ??
        null)
      : null;

  const selectedOccurrenceRollup =
    occurrenceFilter !== null
      ? (occurrenceRollups.find(
          (rollup) => rollup.occurrenceId === occurrenceFilter,
        ) ?? null)
      : null;

  const occurrenceRollupsForSelectedSession =
    sessionFilter !== null
      ? (occurrenceRollupsBySession.get(sessionFilter) ?? [])
      : [];

  const visibleScopedEntries = showReleased
    ? scopedEntries
    : scopedEntries.filter((entry) => entry.state !== "released");

  return (
    <div className="space-y-6">
      <ProgramRosterSummary
        totals={tileTotals}
        showReleased={showReleased}
        onToggleReleased={() => setShowReleased((prev) => !prev)}
      />

      <RosterLevelFilters
        sessions={roster.sessions}
        occurrences={occurrenceOptions}
        sessionFilter={sessionFilter}
        occurrenceFilter={occurrenceFilter}
        search={search}
        onSessionChange={handleSessionChange}
        onOccurrenceChange={setOccurrenceFilter}
        onSearchChange={setSearch}
      />

      {isSearching ? (
        searchResults.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin resultados para &quot;{search}&quot;.
          </p>
        ) : (
          <OccurrenceRosterTable
            entries={searchResults}
            occurrenceContext={occurrenceContext}
          />
        )
      ) : selectedSessionRollup && selectedOccurrenceRollup ? (
        <OccurrenceRosterTable entries={visibleScopedEntries} />
      ) : selectedSessionRollup ? (
        selectedSessionRollup.totals.occupied +
          selectedSessionRollup.totals.released ===
        0 ? (
          <p className="text-sm text-muted-foreground">
            Nadie se inscribió a esta sesión todavía.
          </p>
        ) : (
          <ul className="space-y-2">
            {occurrenceRollupsForSelectedSession.map((rollup) => (
              <OccurrenceRollupRow
                key={rollup.occurrenceId}
                rollup={rollup}
                programStatus={roster.programStatus}
                sessionStatus={selectedSessionRollup.status}
                now={roster.now}
                entries={entriesByOccurrenceId.get(rollup.occurrenceId) ?? []}
                showReleased={showReleased}
                onSelect={() => setOccurrenceFilter(rollup.occurrenceId)}
              />
            ))}
          </ul>
        )
      ) : roster.sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay sesiones en este programa.
        </p>
      ) : roster.entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía nadie se inscribió a este programa.
        </p>
      ) : (
        <ul className="space-y-2">
          {sessionRollups.map((rollup) => (
            <SessionRollupRow
              key={rollup.sessionId}
              rollup={rollup}
              programStatus={roster.programStatus}
              now={roster.now}
              occurrenceRollups={
                occurrenceRollupsBySession.get(rollup.sessionId) ?? []
              }
              entriesByOccurrenceId={entriesByOccurrenceId}
              showReleased={showReleased}
              onSelectSession={() => handleSessionChange(rollup.sessionId)}
              onSelectOccurrence={(occurrenceId) => {
                setSessionFilter(rollup.sessionId);
                setOccurrenceFilter(occurrenceId);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
