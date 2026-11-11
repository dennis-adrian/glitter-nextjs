-- Newest-first reads for the admin notification log (/dashboard/notifications):
-- each source is read in (created_at DESC, id DESC) order, which otherwise
-- sorts the whole table for every page. The disciplinary outbox is left out:
-- it stays small enough that sorting it costs nothing.
--
-- Plain CREATE INDEX takes a SHARE lock: reads go on, but inserts and updates
-- on each table wait until the migration's transaction commits. The migrator
-- runs in one transaction, so CONCURRENTLY is not possible here. To avoid the
-- wait on a large table, build them first by hand with
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS (same names and columns); then these
-- statements find them and do nothing.
CREATE INDEX IF NOT EXISTS "notification_deliveries_created_at_idx" ON "notification_deliveries" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reservation_notification_jobs_created_at_idx" ON "reservation_notification_jobs" USING btree ("created_at","id");
