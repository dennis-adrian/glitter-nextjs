ALTER TABLE "post_share_links" ADD COLUMN "token" text NOT NULL;--> statement-breakpoint
ALTER TABLE "post_share_links" ADD CONSTRAINT "post_share_links_token_unique" UNIQUE("token");