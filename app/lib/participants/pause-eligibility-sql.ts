import { sql } from "drizzle-orm";

/**
 * Canonical festival timing for pause eligibility and activity columns.
 * Uses festival_dates; festivals.start_date/end_date are deprecated.
 */
export const pauseEligibilityFestivalCtes = sql`
  festival_last_occurrence as (
    select
      festival_id,
      max(end_date) as last_occurrence_at,
      min(start_date) as first_start_at
    from festival_dates
    group by festival_id
  ),
  latest_festivals as (
    select f.id
    from festivals f
    inner join festival_last_occurrence flo on flo.festival_id = f.id
    where f.status in ('published', 'active', 'archived')
      and flo.first_start_at <= now()
    order by flo.last_occurrence_at desc nulls last, f.id desc
    limit 3
  )
`;

export const participationOccurredAtSql = sql`
  coalesce(flo.last_occurrence_at, sr.updated_at)
`;

export const participatedRecentlyExpression = sql`
  (
    coalesce(pa.participated_recently, false)
    or coalesce(
      lpf.festival_id in (select id from latest_festivals),
      false
    )
  )
`;
