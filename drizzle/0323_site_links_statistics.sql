-- Statistics of /links: daily counts, one row per Bolivian day (America/La_Paz)
-- and source, never one per visit. No address, browser or other detail of a
-- visitor is kept. `source` is read from the referrer: instagram, tiktok,
-- facebook, direct or other.
--
-- Safe to run again: on a database that has none of this, or that ran this
-- migration in part or in full, every statement only adds what is missing. A
-- table of these names that was made some other way is not repaired: the last
-- statement checks the keys the counters rely on and fails the migration
-- rather than let it pass without them. The tables start empty;
-- `site_links.click_count` stays the lifetime total, counted since before
-- these existed.
--
-- `site_links_daily_views`: times the page was shown, per day and source.
CREATE TABLE IF NOT EXISTS "site_links_daily_views" (
	"day" date NOT NULL,
	"source" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "site_links_daily_views_day_source_pk" PRIMARY KEY("day","source"),
	CONSTRAINT "site_links_daily_views_source_check" CHECK ("site_links_daily_views"."source" in ('instagram', 'tiktok', 'facebook', 'direct', 'other')),
	CONSTRAINT "site_links_daily_views_views_check" CHECK ("site_links_daily_views"."views" >= 0)
);
--> statement-breakpoint
-- `site_links_daily_clicks`: taps on a link or social icon, per day and source.
-- When a link is deleted its rows stay with `link_id` emptied (ON DELETE SET
-- NULL), so a period's totals do not change after the fact; the dashboard
-- shows them together as deleted links. Rows of deleted links may repeat a day
-- and source, which the unique index allows (nulls are distinct).
CREATE TABLE IF NOT EXISTS "site_links_daily_clicks" (
	"id" serial PRIMARY KEY NOT NULL,
	"link_id" integer,
	"day" date NOT NULL,
	"source" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "site_links_daily_clicks_source_check" CHECK ("site_links_daily_clicks"."source" in ('instagram', 'tiktok', 'facebook', 'direct', 'other')),
	CONSTRAINT "site_links_daily_clicks_clicks_check" CHECK ("site_links_daily_clicks"."clicks" >= 0)
);
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'site_links_daily_clicks_link_id_site_links_id_fk'
			AND conrelid = 'public.site_links_daily_clicks'::regclass
	) THEN
		ALTER TABLE "site_links_daily_clicks" ADD CONSTRAINT "site_links_daily_clicks_link_id_site_links_id_fk" FOREIGN KEY ("link_id") REFERENCES "public"."site_links"("id") ON DELETE set null ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "site_links_daily_clicks_link_day_source" ON "site_links_daily_clicks" USING btree ("link_id","day","source");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_links_daily_clicks_day_idx" ON "site_links_daily_clicks" USING btree ("day");--> statement-breakpoint
-- The counters add to a day's row with ON CONFLICT on these keys, and a
-- deleted link's rows keep their place through this foreign key. Without
-- them the counting fails or goes wrong, so the migration fails here instead.
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.site_links_daily_views'::regclass
			AND contype = 'p'
			AND conkey = ARRAY(
				SELECT attnum FROM pg_attribute
				WHERE attrelid = 'public.site_links_daily_views'::regclass
					AND attname IN ('day', 'source')
				ORDER BY array_position(ARRAY['day', 'source']::name[], attname)
			)::int2[]
	) THEN
		RAISE EXCEPTION 'site_links_daily_views has no primary key on (day, source)';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_index
		WHERE indrelid = 'public.site_links_daily_clicks'::regclass
			AND indisunique
			AND indexrelid = 'public.site_links_daily_clicks_link_day_source'::regclass
	) THEN
		RAISE EXCEPTION 'site_links_daily_clicks has no unique index on (link_id, day, source)';
	END IF;
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conrelid = 'public.site_links_daily_clicks'::regclass
			AND contype = 'f'
			AND confrelid = 'public.site_links'::regclass
			AND confdeltype = 'n'
	) THEN
		RAISE EXCEPTION 'site_links_daily_clicks.link_id does not reference site_links with ON DELETE SET NULL';
	END IF;
END $$;
