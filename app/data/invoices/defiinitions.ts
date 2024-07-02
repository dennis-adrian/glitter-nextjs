import { StandReservationWithFestival } from "@/app/api/stands/actions";
import { StandBase } from "@/app/api/stands/definitions";
import { invoices, payments, standReservations, users } from "@/db/schema";

export type InvoiceBase = typeof invoices.$inferSelect;
export type InvoiceWithPayments = InvoiceBase & {
  payments: (typeof payments.$inferSelect)[];
};
export type InvoiceWithPaymentsAndStand = InvoiceWithPayments & {
  reservation: StandReservationWithFestival & {
    stand: StandBase;
  };
};

export type InvoiceStatus = InvoiceBase["status"];
export type InvoiceWithPaymentsAndStandAndProfile =
  InvoiceWithPaymentsAndStand & {
    user: typeof users.$inferSelect;
  };

export type NewPayment = typeof payments.$inferInsert;
export type PaymentBase = typeof payments.$inferSelect;
