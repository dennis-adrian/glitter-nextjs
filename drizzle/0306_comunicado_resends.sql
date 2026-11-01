CREATE TABLE "comunicado_resends" (
	"id" serial PRIMARY KEY NOT NULL,
	"comunicado_id" integer NOT NULL,
	"request_key" text NOT NULL,
	"includes_audience" boolean NOT NULL,
	"people" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"send_email" boolean NOT NULL,
	"send_push" boolean NOT NULL,
	"essential" boolean DEFAULT false NOT NULL,
	"essential_confirmed_by_user_id" integer,
	"revision" integer NOT NULL,
	"summary" jsonb NOT NULL,
	"created_by_user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "comunicado_resends_has_target" CHECK ("comunicado_resends"."includes_audience" OR jsonb_array_length("comunicado_resends"."people") > 0),
	CONSTRAINT "comunicado_resends_essential" CHECK (NOT "comunicado_resends"."essential" OR ("comunicado_resends"."send_email" AND "comunicado_resends"."includes_audience" AND jsonb_array_length("comunicado_resends"."people") = 0)),
	CONSTRAINT "comunicado_resends_essential_confirmed" CHECK ("comunicado_resends"."essential" = ("comunicado_resends"."essential_confirmed_by_user_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD COLUMN "resend_id" integer;--> statement-breakpoint
ALTER TABLE "comunicado_resends" ADD CONSTRAINT "comunicado_resends_comunicado_id_comunicados_id_fk" FOREIGN KEY ("comunicado_id") REFERENCES "public"."comunicados"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicado_resends" ADD CONSTRAINT "comunicado_resends_essential_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("essential_confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comunicado_resends" ADD CONSTRAINT "comunicado_resends_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comunicado_resends_request_key_unique" ON "comunicado_resends" USING btree ("request_key");--> statement-breakpoint
CREATE INDEX "comunicado_resends_comunicado_idx" ON "comunicado_resends" USING btree ("comunicado_id","id");--> statement-breakpoint
ALTER TABLE "notification_campaign_recipients" ADD CONSTRAINT "notification_campaign_recipients_resend_id_comunicado_resends_id_fk" FOREIGN KEY ("resend_id") REFERENCES "public"."comunicado_resends"("id") ON DELETE restrict ON UPDATE no action;