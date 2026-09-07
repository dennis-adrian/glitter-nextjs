import { z } from "zod";

import type { RecentCheckIn } from "@/app/components/dashboard/programs/checkin/checkin-recent-list";

/**
 * The recent-scan list, kept in `sessionStorage` and exposed as a subscribable
 * store.
 *
 * `sessionStorage` rather than `localStorage` on purpose: this list is a
 * glance-back aid for the operator holding the phone, not a record. The record
 * is `sessionAttendances` in the database, shown on the occurrence roster.
 * Scoping it to the tab means a shared device does not hand the next person a
 * log of someone else's door shift, and nothing has to expire it.
 *
 * A store rather than React state mirrored into storage, because the panel is
 * server-pre-rendered: reading storage during that render is impossible and
 * restoring it afterwards with `setState` is a cascading render. Storage is the
 * one source of truth and `useSyncExternalStore` reads from it.
 */
const KEY_PREFIX = "glitter:checkin-recent:";

/** Scoped per occurrence so two doors on one phone never blend together. */
function keyFor(occurrenceId: number): string {
  return `${KEY_PREFIX}${occurrenceId}`;
}

/**
 * Shared so that every empty snapshot is the *same* empty snapshot.
 * `useSyncExternalStore` compares snapshots by identity and re-renders forever
 * if a fresh `[]` comes back each time it asks.
 */
export const NO_RECENT_CHECK_INS: RecentCheckIn[] = [];

/**
 * Mirrors `CheckInResult`. The annotation on `entrySchema` below is what keeps
 * the two in step: if a new outcome is added to the union and not to this
 * schema, the assignment stops compiling.
 */
const resultSchema = z.discriminatedUnion("outcome", [
  z.object({
    outcome: z.literal("checked_in"),
    attendeeName: z.string(),
    checkedInAt: z.coerce.date(),
  }),
  z.object({
    outcome: z.literal("already_used"),
    attendeeName: z.string(),
    checkedInAt: z.coerce.date(),
  }),
  z.object({
    outcome: z.literal("wrong_occurrence"),
    sessionTitle: z.string(),
  }),
  z.object({
    outcome: z.literal("cancelled"),
    attendeeName: z.string(),
  }),
  z.object({ outcome: z.literal("not_found") }),
  z.object({ outcome: z.literal("occurrence_closed") }),
]);

/**
 * `z.coerce.date` is doing the real work here: JSON has no date type, so every
 * `Date` comes back as an ISO string and would otherwise reach the list as
 * something that has no `toLocaleString`.
 */
const entrySchema: z.ZodType<RecentCheckIn> = z.object({
  id: z.number().int().nonnegative(),
  at: z.coerce.date(),
  result: resultSchema,
});

const storedSchema = z.array(entrySchema);

/**
 * Parsed snapshots, one per occurrence key.
 *
 * Not an optimisation: `useSyncExternalStore` demands that repeated calls
 * return an identical reference while nothing has changed, and parsing afresh
 * would hand it a new array every time.
 */
const snapshots = new Map<string, RecentCheckIn[]>();

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** Subscribes to changes. The returned function unsubscribes. */
export function subscribeToRecentCheckIns(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Reads the list back, or an empty one for anything unusable.
 *
 * Storage is a place other code — an extension, an older build of this page —
 * can write to, so the contents are parsed rather than trusted. A shape we do
 * not recognise is discarded silently: an operator at a door can act on an
 * empty history, but not on an error about deserialisation.
 */
export function getRecentCheckIns(occurrenceId: number): RecentCheckIn[] {
  if (typeof window === "undefined") return NO_RECENT_CHECK_INS;

  const key = keyFor(occurrenceId);
  const cached = snapshots.get(key);
  if (cached !== undefined) return cached;

  let items: RecentCheckIn[] = NO_RECENT_CHECK_INS;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw) {
      const parsed = storedSchema.safeParse(JSON.parse(raw));
      if (parsed.success && parsed.data.length > 0) items = parsed.data;
    }
  } catch {
    // Private-mode Safari throws on access rather than returning null.
  }

  snapshots.set(key, items);
  return items;
}

/** Replaces the list, giving up quietly if the browser refuses to store it. */
export function setRecentCheckIns(
  occurrenceId: number,
  items: RecentCheckIn[],
): void {
  if (typeof window === "undefined") return;

  const key = keyFor(occurrenceId);
  snapshots.set(key, items);

  try {
    window.sessionStorage.setItem(key, JSON.stringify(items));
  } catch {
    // Full or disabled storage costs the operator the reload, never the scan:
    // the snapshot above still carries the list for this page's lifetime.
  }

  emit();
}

/** Forgets the list for one occurrence. */
export function clearRecentCheckIns(occurrenceId: number): void {
  if (typeof window === "undefined") return;

  const key = keyFor(occurrenceId);
  snapshots.set(key, NO_RECENT_CHECK_INS);

  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to recover: the list is a convenience, the roster is the record.
  }

  emit();
}
