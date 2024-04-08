import { invoices } from "@/db/schema";

export type InvoiceBase = typeof invoices.$inferSelect;
