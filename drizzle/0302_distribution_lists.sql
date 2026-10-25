CREATE TYPE "public"."distribution_list_kind" AS ENUM('filter', 'fixed');--> statement-breakpoint
CREATE TABLE "distribution_list_members" (
	"list_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"added_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_list_members_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "distribution_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "distribution_list_kind" NOT NULL,
	"filter" jsonb,
	"created_by_user_id" integer,
	"updated_by_user_id" integer,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_lists_filter_per_kind" CHECK (("distribution_lists"."kind" = 'filter') = ("distribution_lists"."filter" IS NOT NULL)),
	CONSTRAINT "distribution_lists_name_length" CHECK (char_length(btrim("distribution_lists"."name")) BETWEEN 1 AND 60),
	CONSTRAINT "distribution_lists_description_length" CHECK ("distribution_lists"."description" IS NULL OR char_length("distribution_lists"."description") <= 200)
);
--> statement-breakpoint
ALTER TABLE "distribution_list_members" ADD CONSTRAINT "distribution_list_members_list_id_distribution_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."distribution_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_list_members" ADD CONSTRAINT "distribution_list_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_list_members" ADD CONSTRAINT "distribution_list_members_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD CONSTRAINT "distribution_lists_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD CONSTRAINT "distribution_lists_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "distribution_list_members_user_idx" ON "distribution_list_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "distribution_lists_name_unique" ON "distribution_lists" USING btree (lower(btrim("name"))) WHERE "distribution_lists"."archived_at" IS NULL;