ALTER TYPE "public"."stand_status" ADD VALUE 'held' BEFORE 'reserved';--> statement-breakpoint
CREATE TABLE "stand_holds" (
	"id" serial PRIMARY KEY NOT NULL,
	"stand_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"festival_id" integer NOT NULL,
	"expires_at" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stand_holds" ADD CONSTRAINT "stand_holds_stand_id_stands_id_fk" FOREIGN KEY ("stand_id") REFERENCES "public"."stands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_holds" ADD CONSTRAINT "stand_holds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stand_holds" ADD CONSTRAINT "stand_holds_festival_id_festivals_id_fk" FOREIGN KEY ("festival_id") REFERENCES "public"."festivals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stand_holds_stand_idx" ON "stand_holds" USING btree ("stand_id");--> statement-breakpoint
CREATE INDEX "stand_holds_user_festival_idx" ON "stand_holds" USING btree ("user_id","festival_id");