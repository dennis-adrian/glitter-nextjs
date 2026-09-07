CREATE TYPE "public"."post_status" AS ENUM('draft', 'submitted', 'approved', 'scheduled', 'published', 'rejected', 'archived');--> statement-breakpoint
CREATE TABLE "post_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "post_categories_to_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_categories_to_posts_post_id_category_id_unique" UNIQUE("post_id","category_id")
);
--> statement-breakpoint
CREATE TABLE "post_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_tags_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "post_tags_to_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "post_tags_to_posts_post_id_tag_id_unique" UNIQUE("post_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"excerpt" text,
	"cover_image_url" text,
	"content" jsonb NOT NULL,
	"content_html" text NOT NULL,
	"seo_title" text,
	"seo_description" text,
	"author_id" integer NOT NULL,
	"status" "post_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"published_at" timestamp,
	"reviewer_id" integer,
	"reviewer_notes" text,
	"working_title" text,
	"working_slug" text,
	"working_excerpt" text,
	"working_cover_image_url" text,
	"working_content" jsonb,
	"working_content_html" text,
	"working_seo_title" text,
	"working_seo_description" text,
	"working_category_ids" jsonb,
	"working_tag_inputs" jsonb,
	"working_updated_at" timestamp,
	"working_submitted_at" timestamp,
	"working_reviewer_notes" text,
	"working_reviewer_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "posts_slug_unique" UNIQUE("slug"),
	CONSTRAINT "posts_non_draft_requires_title_check" CHECK ("posts"."status" = 'draft' OR length(btrim("posts"."title")) >= 3)
);
--> statement-breakpoint
ALTER TABLE "post_categories_to_posts" ADD CONSTRAINT "post_categories_to_posts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_categories_to_posts" ADD CONSTRAINT "post_categories_to_posts_category_id_post_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."post_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags_to_posts" ADD CONSTRAINT "post_tags_to_posts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_tags_to_posts" ADD CONSTRAINT "post_tags_to_posts_tag_id_post_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."post_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_working_reviewer_id_users_id_fk" FOREIGN KEY ("working_reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_post_categories_to_posts_category_id" ON "post_categories_to_posts" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "idx_post_tags_to_posts_tag_id" ON "post_tags_to_posts" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "posts_status_published_at_idx" ON "posts" USING btree ("status","published_at");--> statement-breakpoint
CREATE INDEX "posts_author_idx" ON "posts" USING btree ("author_id");