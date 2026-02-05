CREATE TABLE "map_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"template_data" jsonb NOT NULL,
	"created_by_user_id" integer,
	"created_from_festival_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_templates" ADD CONSTRAINT "map_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_templates" ADD CONSTRAINT "map_templates_created_from_festival_id_festivals_id_fk" FOREIGN KEY ("created_from_festival_id") REFERENCES "public"."festivals"("id") ON DELETE set null ON UPDATE no action;