/**
 * Owner-backfill keyset helpers. The cursor must advance for every examined
 * reservation — including ownerless rows skipped for missing participants —
 * so a full batch of non-actionable rows cannot stall later backfill steps.
 */

export type OwnerBackfillRow = { reservationId: number };

export function nextOwnerBackfillAfterId(
  afterId: number,
  examinedRows: readonly OwnerBackfillRow[],
): number {
  const lastExamined = examinedRows.at(-1);
  return lastExamined === undefined ? afterId : lastExamined.reservationId;
}

export function ownerBackfillHasMore(
  fetchedCount: number,
  size: number,
): boolean {
  return fetchedCount === size;
}
