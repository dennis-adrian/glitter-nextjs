import { StandReservationWithFestival } from "@/app/api/stands/actions";
import { ReservationStandMember } from "@/app/api/reservations/definitions";
import { StandBase } from "@/app/api/stands/definitions";
import { FestivalWithDates } from "@/app/lib/festivals/definitions";
import {
  festivalSectors,
  invoices,
  payments,
  qrCodes,
  users,
  reservationParticipants,
  standReservations,
} from "@/db/schema";

export type InvoiceBase = typeof invoices.$inferSelect;
export type InvoiceWithPayments = InvoiceBase & {
  payments: (typeof payments.$inferSelect)[];
};
export type InvoiceWithPaymentsAndOwner = InvoiceWithPayments & {
  user: typeof users.$inferSelect;
};
export type ReservationWithStandAndInvoicesAndFestival =
  typeof standReservations.$inferSelect & {
    stand: StandBase & {
      festivalSector: typeof festivalSectors.$inferSelect | null;
    };
    invoices: InvoiceWithPaymentsAndOwner[];
    festival: FestivalWithDates;
  };
export type InvoiceWithPaymentsAndStand = InvoiceWithPayments & {
  reservation: StandReservationWithFestival & {
    /** The originally selected half. Use `members` for what is occupied. */
    stand: StandBase & {
      qrCode?: typeof qrCodes.$inferSelect | null;
    };
    members: ReservationStandMember[];
  };
};

export type InvoiceStatus = InvoiceBase["status"];
export type InvoiceWithPaymentsAndStandAndProfile =
  InvoiceWithPaymentsAndStand & {
    user: typeof users.$inferSelect;
  };

export type NewPayment = typeof payments.$inferInsert;
export type PaymentBase = typeof payments.$inferSelect;

export type ReservationParticipantWithUser =
  typeof reservationParticipants.$inferSelect & {
    user: typeof users.$inferSelect;
  };

export type InvoiceWithParticipants = InvoiceWithPaymentsAndStandAndProfile & {
  reservation: InvoiceWithPaymentsAndStandAndProfile["reservation"] & {
    participants: ReservationParticipantWithUser[];
  };
};
