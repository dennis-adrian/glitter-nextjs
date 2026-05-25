ALTER TABLE "posts" ADD COLUMN "working_title" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_slug" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_excerpt" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_cover_image_url" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_content" jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_content_html" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_seo_title" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_seo_description" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_category_ids" jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_tag_inputs" jsonb;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_submitted_at" timestamp;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_reviewer_notes" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "working_reviewer_id" integer;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_working_reviewer_id_users_id_fk" FOREIGN KEY ("working_reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;