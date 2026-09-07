ALTER TABLE "credit_ledger_entries" DROP CONSTRAINT "credit_ledger_entries_reverses_entry_id_credit_ledger_entries_id_fk";
--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_reverses_entry_id_fk" FOREIGN KEY ("reverses_entry_id") REFERENCES "public"."credit_ledger_entries"("id") ON DELETE restrict ON UPDATE no action;