CREATE TABLE "finance_festival_settings" (
	"festival_id" integer PRIMARY KEY NOT NULL,
	"credit_lead_days" smallint,
	"updated_by_user_id" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "finance_festival_settings_credit_lead_days_range" CHECK ("finance_festival_settings"."credit_lead_days" IS NULL OR "finance_festival_settings"."credit_lead_days" BETWEEN 0 AND 30)
);
--> statement-breakpoint
ALTER TABLE "finance_festival_settings" ADD CONSTRAINT "finance_festival_settings_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_festival_settings" ADD CONSTRAINT "finance_festival_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;