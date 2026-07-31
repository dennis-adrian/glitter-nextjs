CREATE TABLE "session_purchase_vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_id" integer NOT NULL,
	"version" integer NOT NULL,
	"file_url" text NOT NULL,
	"uploaded_by_user_id" integer,
	"uploaded_via" "purchase_actor_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "session_purchase_vouchers_purchase_version_unique" UNIQUE("purchase_id","version"),
	CONSTRAINT "session_purchase_vouchers_version_positive" CHECK ("session_purchase_vouchers"."version" >= 1),
	CONSTRAINT "session_purchase_vouchers_file_present" CHECK (length(trim("session_purchase_vouchers"."file_url")) > 0),
	CONSTRAINT "session_purchase_vouchers_uploaded_via_valid" CHECK ("session_purchase_vouchers"."uploaded_via" IN ('buyer', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "session_purchase_vouchers" ADD CONSTRAINT "session_purchase_vouchers_purchase_id_session_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."session_purchases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_purchase_vouchers" ADD CONSTRAINT "session_purchase_vouchers_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;