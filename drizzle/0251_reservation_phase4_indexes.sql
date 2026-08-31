DELETE FROM "stand_subcategories" AS duplicate
USING "stand_subcategories" AS keeper
WHERE duplicate.id > keeper.id
  AND duplicate.stand_id = keeper.stand_id
  AND duplicate.subcategory_id = keeper.subcategory_id;--> statement-breakpoint
CREATE INDEX "invoices_reservation_user_status_idx" ON "invoices" USING btree ("reservation_id","user_id","status");--> statement-breakpoint
CREATE INDEX "payments_invoice_id_created_at_idx" ON "payments" USING btree ("invoice_id","created_at");--> statement-breakpoint
CREATE INDEX "stand_reservations_festival_status_stand_idx" ON "stand_reservations" USING btree ("festival_id","status","stand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stand_subcategories_stand_id_subcategory_id_unique" ON "stand_subcategories" USING btree ("stand_id","subcategory_id");--> statement-breakpoint
CREATE INDEX "stands_festival_category_participation_sector_status_idx" ON "stands" USING btree ("festival_id","stand_category","participation_type","festival_sector_id","status");--> statement-breakpoint
CREATE INDEX "user_requests_user_festival_type_status_terms_idx" ON "user_requests" USING btree ("user_id","festival_id","type","status","terms_version_id");--> statement-breakpoint
CREATE INDEX "users_display_name_normalized_trgm_idx" ON "users" USING gin (replace(lower("display_name"), ' ', '') gin_trgm_ops);