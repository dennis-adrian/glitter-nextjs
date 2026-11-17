CREATE TABLE "site_link_images" (
	"url" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_links" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "site_links_settings" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;