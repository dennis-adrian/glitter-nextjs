CREATE TYPE "public"."participant_discount_type" AS ENUM('percent', 'fixed');--> statement-breakpoint
ALTER TABLE "program_settings" DROP CONSTRAINT "program_settings_discount_range";--> statement-breakpoint
ALTER TABLE "programs" DROP CONSTRAINT "programs_discount_range";--> statement-breakpoint
ALTER TABLE "program_settings" ADD COLUMN "default_participant_discount_type" "participant_discount_type" DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE "program_settings" ADD COLUMN "default_participant_discount_value" numeric(10, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "participant_discount_type" "participant_discount_type";--> statement-breakpoint
ALTER TABLE "programs" ADD COLUMN "participant_discount_value" numeric(10, 2);--> statement-breakpoint
--> Carry existing percentages into the new type/value pair before 0216 drops the
--> old columns. Percent stays the type, so behaviour is unchanged.
UPDATE "program_settings" SET "default_participant_discount_type" = 'percent', "default_participant_discount_value" = "default_participant_discount_percent";--> statement-breakpoint
UPDATE "programs" SET "participant_discount_type" = 'percent', "participant_discount_value" = "participant_discount_percent" WHERE "participant_discount_percent" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "program_settings" ADD CONSTRAINT "program_settings_discount_range" CHECK ("program_settings"."default_participant_discount_value" >= 0
        AND ("program_settings"."default_participant_discount_type" <> 'percent'
             OR "program_settings"."default_participant_discount_value" <= 100));--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_discount_pair_complete" CHECK (("programs"."participant_discount_type" IS NULL AND "programs"."participant_discount_value" IS NULL)
        OR ("programs"."participant_discount_type" IS NOT NULL AND "programs"."participant_discount_value" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "programs" ADD CONSTRAINT "programs_discount_range" CHECK ("programs"."participant_discount_value" IS NULL
        OR ("programs"."participant_discount_value" >= 0
            AND ("programs"."participant_discount_type" <> 'percent'
                 OR "programs"."participant_discount_value" <= 100)));