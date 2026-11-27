CREATE TYPE "public"."credential_group" AS ENUM('illustration', 'entrepreneurship', 'gastronomy', 'external', 'volunteer', 'staff');--> statement-breakpoint
CREATE TYPE "public"."credential_naming_mode" AS ENUM('one_per_participant', 'all_named', 'none');--> statement-breakpoint
CREATE TABLE "credential_print_batch_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" integer NOT NULL,
	"festival_id" integer NOT NULL,
	"unit_key" text NOT NULL,
	"group" "credential_group" NOT NULL,
	"user_id" integer,
	"printed_name" text,
	"detail" text DEFAULT '' NOT NULL,
	"named_count" smallint NOT NULL,
	"unnamed_count" smallint NOT NULL,
	"is_reprint" boolean DEFAULT false NOT NULL,
	CONSTRAINT "credential_print_batch_items_counts_nonnegative" CHECK ("credential_print_batch_items"."named_count" >= 0 AND "credential_print_batch_items"."unnamed_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credential_print_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"note" text,
	"rules" jsonb NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credential_print_batches_id_festival_id_unique" UNIQUE("id","festival_id"),
	CONSTRAINT "credential_print_batches_note_length" CHECK ("credential_print_batches"."note" IS NULL OR char_length("credential_print_batches"."note") <= 200)
);
--> statement-breakpoint
CREATE TABLE "festival_credential_rules" (
	"festival_id" integer NOT NULL,
	"group" "credential_group" NOT NULL,
	"quantity" smallint NOT NULL,
	"naming_mode" "credential_naming_mode",
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "festival_credential_rules_pk" PRIMARY KEY("festival_id","group"),
	CONSTRAINT "festival_credential_rules_quantity_range" CHECK ("festival_credential_rules"."quantity" BETWEEN 0 AND 20)
);
--> statement-breakpoint
CREATE TABLE "festival_external_credential_overrides" (
	"festival_id" integer NOT NULL,
	"external_participant_id" integer NOT NULL,
	"quantity" smallint NOT NULL,
	"stands_at_override" smallint NOT NULL,
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "festival_external_credential_overrides_pk" PRIMARY KEY("festival_id","external_participant_id"),
	CONSTRAINT "festival_external_credential_overrides_quantity_range" CHECK ("festival_external_credential_overrides"."quantity" BETWEEN 0 AND 50),
	CONSTRAINT "festival_external_credential_overrides_stands_nonnegative" CHECK ("festival_external_credential_overrides"."stands_at_override" >= 0)
);
--> statement-breakpoint
CREATE TABLE "festival_extra_credentials" (
	"id" serial PRIMARY KEY NOT NULL,
	"festival_id" integer NOT NULL,
	"name" text,
	"label" text NOT NULL,
	"quantity" smallint DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "festival_extra_credentials_named_is_one" CHECK ("festival_extra_credentials"."name" IS NULL OR "festival_extra_credentials"."quantity" = 1),
	CONSTRAINT "festival_extra_credentials_quantity_range" CHECK ("festival_extra_credentials"."quantity" BETWEEN 1 AND 200),
	CONSTRAINT "festival_extra_credentials_name_length" CHECK ("festival_extra_credentials"."name" IS NULL OR char_length("festival_extra_credentials"."name") BETWEEN 1 AND 120),
	CONSTRAINT "festival_extra_credentials_label_length" CHECK (char_length("festival_extra_credentials"."label") BETWEEN 1 AND 80)
);
--> statement-breakpoint
CREATE TABLE "festival_staff_members" (
	"festival_id" integer NOT NULL,
	"staff_member_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "festival_staff_members_pk" PRIMARY KEY("festival_id","staff_member_id")
);
--> statement-breakpoint
CREATE TABLE "staff_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"role_label" text DEFAULT '' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "staff_members_full_name_length" CHECK (char_length("staff_members"."full_name") BETWEEN 1 AND 120),
	CONSTRAINT "staff_members_role_label_length" CHECK (char_length("staff_members"."role_label") <= 80)
);
--> statement-breakpoint
ALTER TABLE "credential_print_batch_items" ADD CONSTRAINT "credential_print_batch_items_batch_festival_fk" FOREIGN KEY ("batch_id","festival_id") REFERENCES "public"."credential_print_batches"("id","festival_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_print_batches" ADD CONSTRAINT "credential_print_batches_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_print_batches" ADD CONSTRAINT "credential_print_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_credential_rules" ADD CONSTRAINT "festival_credential_rules_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_credential_rules" ADD CONSTRAINT "festival_credential_rules_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_external_credential_overrides" ADD CONSTRAINT "festival_external_credential_overrides_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_external_credential_overrides" ADD CONSTRAINT "festival_external_credential_overrides_external_participant_id_external_participants_id_fk" FOREIGN KEY ("external_participant_id") REFERENCES "public"."external_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_external_credential_overrides" ADD CONSTRAINT "festival_external_credential_overrides_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_extra_credentials" ADD CONSTRAINT "festival_extra_credentials_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_staff_members" ADD CONSTRAINT "festival_staff_members_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "festival_staff_members" ADD CONSTRAINT "festival_staff_members_staff_member_id_staff_members_id_fk" FOREIGN KEY ("staff_member_id") REFERENCES "public"."staff_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credential_print_batch_items_festival_unit_idx" ON "credential_print_batch_items" USING btree ("festival_id","unit_key");--> statement-breakpoint
CREATE UNIQUE INDEX "credential_print_batch_items_batch_unit_unique" ON "credential_print_batch_items" USING btree ("batch_id","unit_key");--> statement-breakpoint
CREATE INDEX "credential_print_batches_festival_idx" ON "credential_print_batches" USING btree ("festival_id","created_at");--> statement-breakpoint
CREATE INDEX "festival_extra_credentials_festival_idx" ON "festival_extra_credentials" USING btree ("festival_id");--> statement-breakpoint
CREATE INDEX "festival_staff_members_staff_member_idx" ON "festival_staff_members" USING btree ("staff_member_id");