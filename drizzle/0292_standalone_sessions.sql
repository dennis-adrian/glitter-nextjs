ALTER TABLE "program_sessions" ALTER COLUMN "program_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "session_purchases" ALTER COLUMN "program_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "program_sessions" ADD COLUMN "festival_id" integer;--> statement-breakpoint
ALTER TABLE "program_sessions" ADD CONSTRAINT "program_sessions_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "program_sessions_standalone_slug_unique" ON "program_sessions" USING btree ("slug") WHERE "program_sessions"."program_id" IS NULL;--> statement-breakpoint
CREATE INDEX "program_sessions_festival_id_idx" ON "program_sessions" USING btree ("festival_id");--> statement-breakpoint
ALTER TABLE "program_sessions" ADD CONSTRAINT "program_sessions_festival_only_when_standalone" CHECK ("program_sessions"."program_id" IS NULL OR "program_sessions"."festival_id" IS NULL);