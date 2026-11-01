CREATE TABLE "distribution_list_removals" (
	"list_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"removed_by_user_id" integer,
	"removed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "distribution_list_removals_list_id_user_id_pk" PRIMARY KEY("list_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN "origin_festival_id" integer;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN "origin_list_id" integer;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN "origin_name" text;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN "copied_at" timestamp;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD COLUMN "last_pulled_at" timestamp;--> statement-breakpoint
ALTER TABLE "distribution_list_removals" ADD CONSTRAINT "distribution_list_removals_list_id_distribution_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."distribution_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_list_removals" ADD CONSTRAINT "distribution_list_removals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_list_removals" ADD CONSTRAINT "distribution_list_removals_removed_by_user_id_users_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "distribution_list_removals_user_idx" ON "distribution_list_removals" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD CONSTRAINT "distribution_lists_origin_festival_id_festivals_id_fk" FOREIGN KEY ("origin_festival_id") REFERENCES "public"."festivals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD CONSTRAINT "distribution_lists_origin_list_id_distribution_lists_id_fk" FOREIGN KEY ("origin_list_id") REFERENCES "public"."distribution_lists"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "distribution_lists" ADD CONSTRAINT "distribution_lists_origin" CHECK (num_nonnulls("distribution_lists"."origin_festival_id", "distribution_lists"."origin_list_id") <= 1
        AND ("distribution_lists"."origin_name" IS NULL) = ("distribution_lists"."copied_at" IS NULL)
        AND ("distribution_lists"."origin_name" IS NOT NULL OR ("distribution_lists"."origin_festival_id" IS NULL AND "distribution_lists"."origin_list_id" IS NULL AND "distribution_lists"."last_pulled_at" IS NULL))
        AND ("distribution_lists"."origin_name" IS NULL OR "distribution_lists"."kind" = 'fixed'));