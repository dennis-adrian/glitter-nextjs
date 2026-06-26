CREATE TYPE "public"."store_section" AS ENUM('merch', 'supplies');--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "section" "store_section";--> statement-breakpoint
DO $$ BEGIN
	IF (SELECT count(*) FROM "store_settings" WHERE "section" IS NULL) > 1 THEN
		RAISE EXCEPTION 'store_settings has multiple legacy rows without a section; resolve manually before applying this migration';
	END IF;
END $$;--> statement-breakpoint
UPDATE "store_settings" SET "section" = 'merch' WHERE "section" IS NULL;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_section_unique" UNIQUE("section");--> statement-breakpoint
INSERT INTO "store_settings" ("section", "mode") VALUES ('merch', 'auto') ON CONFLICT ("section") DO NOTHING;--> statement-breakpoint
INSERT INTO "store_settings" ("section", "mode", "closed_title", "closed_message") SELECT 'supplies', "mode", "closed_title", "closed_message" FROM "store_settings" WHERE "section" = 'merch' ON CONFLICT ("section") DO NOTHING;--> statement-breakpoint
ALTER TABLE "store_settings" ALTER COLUMN "section" SET NOT NULL;
