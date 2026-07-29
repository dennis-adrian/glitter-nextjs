ALTER TABLE "session_purchases" DROP CONSTRAINT "session_purchases_identity_check";--> statement-breakpoint
ALTER TABLE "session_attendances" DROP CONSTRAINT "session_attendances_ticket_id_session_tickets_id_fk";
--> statement-breakpoint
ALTER TABLE "session_attendances" DROP CONSTRAINT "session_attendances_occurrence_id_session_occurrences_id_fk";
--> statement-breakpoint
ALTER TABLE "session_purchase_lines" DROP CONSTRAINT "session_purchase_lines_occurrence_id_session_occurrences_id_fk";
--> statement-breakpoint
ALTER TABLE "session_purchase_lines" DROP CONSTRAINT "session_purchase_lines_session_id_program_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "session_purchases" DROP CONSTRAINT "session_purchases_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "session_tickets" DROP CONSTRAINT "session_tickets_purchase_line_id_session_purchase_lines_id_fk";
--> statement-breakpoint
ALTER TABLE "session_tickets" DROP CONSTRAINT "session_tickets_occurrence_id_session_occurrences_id_fk";
--> statement-breakpoint
ALTER TABLE "session_purchases" ADD COLUMN "access_token_hash" text NOT NULL;--> statement-breakpoint
ALTER TABLE "session_attendances" ADD CONSTRAINT "session_attendances_ticket_occurrence_fk" FOREIGN KEY ("ticket_id","occurrence_id") REFERENCES "public"."session_tickets"("id","occurrence_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ADD CONSTRAINT "session_purchase_lines_occurrence_session_fk" FOREIGN KEY ("occurrence_id","session_id") REFERENCES "public"."session_occurrences"("id","session_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_purchases" ADD CONSTRAINT "session_purchases_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_tickets" ADD CONSTRAINT "session_tickets_line_occurrence_fk" FOREIGN KEY ("purchase_line_id","occurrence_id") REFERENCES "public"."session_purchase_lines"("id","occurrence_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_occurrences" ADD CONSTRAINT "session_occurrences_id_session_id_unique" UNIQUE("id","session_id");--> statement-breakpoint
ALTER TABLE "session_purchase_lines" ADD CONSTRAINT "session_purchase_lines_id_occurrence_id_unique" UNIQUE("id","occurrence_id");--> statement-breakpoint
ALTER TABLE "session_purchases" ADD CONSTRAINT "session_purchases_access_token_hash_unique" UNIQUE("access_token_hash");--> statement-breakpoint
ALTER TABLE "session_tickets" ADD CONSTRAINT "session_tickets_id_occurrence_id_unique" UNIQUE("id","occurrence_id");--> statement-breakpoint
ALTER TABLE "session_purchases" ADD CONSTRAINT "session_purchases_identity_check" CHECK ((
        ("session_purchases"."user_id" IS NOT NULL AND "session_purchases"."guest_name" IS NULL AND "session_purchases"."guest_email" IS NULL AND "session_purchases"."guest_phone" IS NULL)
        OR
        ("session_purchases"."user_id" IS NULL
         AND "session_purchases"."guest_name" IS NOT NULL AND length(trim("session_purchases"."guest_name")) > 0
         AND "session_purchases"."guest_email" IS NOT NULL AND length(trim("session_purchases"."guest_email")) > 0
         AND "session_purchases"."guest_phone" IS NOT NULL AND length(trim("session_purchases"."guest_phone")) > 0)
      ));