/**
 * Phase 4 covering indexes. CREATE INDEX CONCURRENTLY cannot run inside
 * drizzle-orm migrate()'s single transaction, so these statements execute
 * afterwards on an autocommit connection.
 */
export const RESERVATION_PHASE4_CONCURRENT_INDEXES = [
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "invoices_reservation_user_status_idx" ON "invoices" USING btree ("reservation_id","user_id","status")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "payments_invoice_id_created_at_idx" ON "payments" USING btree ("invoice_id","created_at")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "stand_reservations_festival_status_stand_idx" ON "stand_reservations" USING btree ("festival_id","status","stand_id")`,
  `CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "stand_subcategories_stand_id_subcategory_id_unique" ON "stand_subcategories" USING btree ("stand_id","subcategory_id")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "stands_festival_category_participation_sector_status_idx" ON "stands" USING btree ("festival_id","stand_category","participation_type","festival_sector_id","status")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "user_requests_user_festival_type_status_terms_idx" ON "user_requests" USING btree ("user_id","festival_id","type","status","terms_version_id")`,
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS "users_display_name_normalized_trgm_idx" ON "users" USING gin (replace(lower("display_name"), ' ', '') gin_trgm_ops)`,
] as const;

export async function ensureReservationPhase4Indexes(client: {
  query: (sql: string) => Promise<unknown>;
}) {
  for (const statement of RESERVATION_PHASE4_CONCURRENT_INDEXES) {
    await client.query(statement);
  }
}
