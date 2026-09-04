-- Validates the constraint 0268 added NOT VALID. Drizzle runs each migration
-- file in its own transaction, which is what VALIDATE CONSTRAINT needs: it
-- cannot run in the same transaction that added the constraint, and it takes
-- only SHARE UPDATE EXCLUSIVE, so the row scan does not block reads or writes.
--
-- A no-op on databases where the constraint is already valid, so it is safe on
-- every environment regardless of when 0268 landed there.
ALTER TABLE "reservation_request_registry" VALIDATE CONSTRAINT "reservation_request_registry_operation_check";
