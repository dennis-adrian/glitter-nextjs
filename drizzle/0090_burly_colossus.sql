CREATE TABLE IF NOT EXISTS "qr_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"qr_code_url" text NOT NULL,
	"amount" real NOT NULL,
	"expiration_date" timestamp NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stands" ADD COLUMN "qr_code_id" integer;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "stands" ADD CONSTRAINT "stands_qr_code_id_qr_codes_id_fk" FOREIGN KEY ("qr_code_id") REFERENCES "qr_codes"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
