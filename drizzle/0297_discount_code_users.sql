CREATE TYPE "public"."discount_code_audience" AS ENUM('everyone', 'selected_users');--> statement-breakpoint
CREATE TABLE "discount_code_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"discount_code_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discount_code_users_code_user_unique" UNIQUE("discount_code_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "discount_codes" ADD COLUMN "audience" "discount_code_audience" DEFAULT 'everyone' NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_code_users" ADD CONSTRAINT "discount_code_users_discount_code_id_discount_codes_id_fk" FOREIGN KEY ("discount_code_id") REFERENCES "public"."discount_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discount_code_users" ADD CONSTRAINT "discount_code_users_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "discount_code_users_user_idx" ON "discount_code_users" USING btree ("user_id");--> statement-breakpoint
--> Hand-added: carry each single-user code into the new user set before 0298
--> drops "user_id". A code whose user was already deleted had "user_id" set
--> to NULL by the old foreign key and was public from then on; it stays
--> "everyone", so no code changes who can redeem it.
INSERT INTO "discount_code_users" ("discount_code_id", "user_id")
SELECT "id", "user_id" FROM "discount_codes" WHERE "user_id" IS NOT NULL;--> statement-breakpoint
UPDATE "discount_codes" SET "audience" = 'selected_users' WHERE "user_id" IS NOT NULL;
