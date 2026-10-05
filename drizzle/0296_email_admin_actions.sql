ALTER TYPE "public"."email_topic" ADD VALUE 'all';--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD COLUMN "lifted_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "email_unsubscribes" ADD COLUMN "created_by_user_id" integer;--> statement-breakpoint
ALTER TABLE "email_suppressions" ADD CONSTRAINT "email_suppressions_lifted_by_user_id_users_id_fk" FOREIGN KEY ("lifted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_unsubscribes" ADD CONSTRAINT "email_unsubscribes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;