ALTER TABLE "users" ADD COLUMN "clerk_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_clerk_id_unique" UNIQUE("clerk_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");