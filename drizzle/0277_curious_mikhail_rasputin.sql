CREATE TABLE "post_share_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp,
	"revoked_at" timestamp,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "post_share_links" ADD CONSTRAINT "post_share_links_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_share_links" ADD CONSTRAINT "post_share_links_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "post_share_links_live_idx" ON "post_share_links" USING btree ("post_id") WHERE "post_share_links"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "post_share_links_post_idx" ON "post_share_links" USING btree ("post_id");