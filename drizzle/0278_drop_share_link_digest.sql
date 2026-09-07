-- Hand-added: a schema diff cannot express a data change, and this one is
-- required for 0279 to be applicable at all.
--
-- Every row here was keyed by a SHA-256 digest. The next migration adds the
-- raw token as NOT NULL, which no existing row can supply — the digest is not
-- the secret and cannot be turned back into it. Those links are already dead
-- to the new resolver, so they are deleted rather than carried forward as
-- rows the editor would display as live and that would open nothing.
DELETE FROM "post_share_links";--> statement-breakpoint
ALTER TABLE "post_share_links" DROP CONSTRAINT "post_share_links_token_hash_unique";--> statement-breakpoint
ALTER TABLE "post_share_links" DROP COLUMN "token_hash";