ALTER TABLE "credit_ledger_entries" ALTER COLUMN "metadata" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_type_amount_direction" CHECK (("credit_ledger_entries"."type" IN ('top_up', 'admin_grant') AND "credit_ledger_entries"."amount" > 0)
        OR ("credit_ledger_entries"."type" IN ('spend', 'reversal') AND "credit_ledger_entries"."amount" < 0)
        OR "credit_ledger_entries"."type" = 'admin_adjustment');--> statement-breakpoint
CREATE FUNCTION "prevent_credit_ledger_entry_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Foreign-key cascade deletes run as nested triggers. Permit only that path
  -- so the user FK's ON DELETE CASCADE can complete.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'credit ledger entries are append-only';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "credit_ledger_entries_append_only"
BEFORE UPDATE OR DELETE ON "credit_ledger_entries"
FOR EACH ROW EXECUTE FUNCTION "prevent_credit_ledger_entry_mutation"();
