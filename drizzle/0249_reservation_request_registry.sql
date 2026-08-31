CREATE TYPE "public"."reservation_request_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TABLE "reservation_request_registry" (
	"request_key" text PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"actor_user_id" integer NOT NULL,
	"scope" jsonb NOT NULL,
	"status" "reservation_request_status" DEFAULT 'in_progress' NOT NULL,
	"result_ids" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reservation_request_registry" ADD CONSTRAINT "reservation_request_registry_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_request_registry_actor_operation_idx" ON "reservation_request_registry" USING btree ("actor_user_id","operation");--> statement-breakpoint
ALTER TABLE "reservation_request_registry" ADD CONSTRAINT "reservation_request_registry_operation_check" CHECK ("reservation_request_registry"."operation" IN (
  'createOrReplaceStandHold',
  'confirmStandHold',
  'submitPaymentProof',
  'submitZeroValueInvoice',
  'createAdminReservation',
  'adminConfirmReservation'
));
