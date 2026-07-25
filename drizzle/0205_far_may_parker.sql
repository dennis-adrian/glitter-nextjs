ALTER TABLE "infractions" DROP CONSTRAINT "infractions_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "infractions" ADD CONSTRAINT "infractions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;