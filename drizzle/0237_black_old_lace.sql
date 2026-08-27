CREATE TYPE "public"."festival_terms_section_kind" AS ENUM('rich_text', 'schedule');--> statement-breakpoint
CREATE TYPE "public"."festival_terms_section_layout" AS ENUM('plain', 'accordion', 'card');--> statement-breakpoint
CREATE TYPE "public"."festival_terms_version_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "festival_terms_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "festival_terms_documents_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "festival_terms_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"version_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"kind" "festival_terms_section_kind" DEFAULT 'rich_text' NOT NULL,
	"layout" "festival_terms_section_layout" DEFAULT 'plain' NOT NULL,
	"title" text,
	"body_json" jsonb,
	"body_html" text,
	"audience_categories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"audience_festival_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "festival_terms_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"status" "festival_terms_version_status" DEFAULT 'draft' NOT NULL,
	"changelog" text,
	"published_at" timestamp,
	"published_by_user_id" integer,
	"created_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_requests" ADD COLUMN "terms_version_id" integer;--> statement-breakpoint
ALTER TABLE "festival_terms_sections" ADD CONSTRAINT "festival_terms_sections_version_id_festival_terms_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."festival_terms_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_terms_versions" ADD CONSTRAINT "festival_terms_versions_document_id_festival_terms_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."festival_terms_documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_terms_versions" ADD CONSTRAINT "festival_terms_versions_published_by_user_id_users_id_fk" FOREIGN KEY ("published_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_terms_versions" ADD CONSTRAINT "festival_terms_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "festival_terms_sections_version_sort_idx" ON "festival_terms_sections" USING btree ("version_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "festival_terms_versions_document_number_unique" ON "festival_terms_versions" USING btree ("document_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "festival_terms_versions_one_draft_per_document" ON "festival_terms_versions" USING btree ("document_id") WHERE "festival_terms_versions"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "festival_terms_versions_document_status_idx" ON "festival_terms_versions" USING btree ("document_id","status");--> statement-breakpoint
ALTER TABLE "user_requests" ADD CONSTRAINT "user_requests_terms_version_id_festival_terms_versions_id_fk" FOREIGN KEY ("terms_version_id") REFERENCES "public"."festival_terms_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_requests_terms_version_id_idx" ON "user_requests" USING btree ("terms_version_id");