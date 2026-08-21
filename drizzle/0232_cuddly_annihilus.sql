ALTER TYPE "public"."order_event_type" ADD VALUE 'voucher_submitted' BEFORE 'rental_returned';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'voucher_reviewed' BEFORE 'rental_returned';--> statement-breakpoint
ALTER TYPE "public"."order_event_type" ADD VALUE 'note_added' BEFORE 'rental_returned';