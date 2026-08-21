ALTER TYPE "public"."order_event_type" ADD VALUE 'voucher_submitted' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'voucher_reviewed' BEFORE 'cancelled';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'note_added' BEFORE 'cancelled';
