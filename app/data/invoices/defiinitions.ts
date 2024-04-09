import { StandBase } from "@/app/api/stands/definitions";
import { invoices, payments, standReservations } from "@/db/schema";

export type InvoiceBase = typeof invoices.$inferSelect;
export type InvoiceWithPayments = InvoiceBase & {
  payments: (typeof payments.$inferSelect)[];
};
export type InvoiceWithPaymentsAndStand = InvoiceWithPayments & {
  reservation: typeof standReservations.$inferSelect & {
    stand: StandBase;
  };
};

export type NewPayment = typeof payments.$inferInsert;
