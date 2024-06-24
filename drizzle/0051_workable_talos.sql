CREATE TABLE IF NOT EXISTS "festival_sectors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"map_url" text,
	"festival_id" integer NOT NULL,
	"allowed_user_categories" "user_category",
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_categories_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_category_to_sector_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_category_id" integer NOT NULL,
	"sector_id" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "festival_sector_name_idx" ON "festival_sectors" ("name");--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "festival_sectors" ADD CONSTRAINT "festival_sectors_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "festivals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_category_to_sector_permissions" ADD CONSTRAINT "user_category_to_sector_permissions_user_category_id_user_categories_id_fk" FOREIGN KEY ("user_category_id") REFERENCES "user_categories"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_category_to_sector_permissions" ADD CONSTRAINT "user_category_to_sector_permissions_sector_id_festival_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "festival_sectors"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
