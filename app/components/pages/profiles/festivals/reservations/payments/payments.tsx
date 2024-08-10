import PendingPayment from "@/app/components/payments/pending-payment";
import { fetchBaseFestival } from "@/app/data/festivals/actions";
import { fetchInvoicesByReservation } from "@/app/data/invoices/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound } from "next/navigation";

type PaymentsPageProps = {
  festivalId: number;
  profileId: number;
  reservationId: number;
};
export default async function PaymentsPage(props: PaymentsPageProps) {
  const profile = await getCurrentUserProfile();
  const festival = await fetchBaseFestival(props.festivalId);
  if (!festival || !profile) notFound();
  await protectRoute(profile, props.profileId);

  const invoices = await fetchInvoicesByReservation(props.reservationId);
  const pendingInvoices = invoices?.filter(
    (invoice) => invoice.status === "pending",
  );

  if (pendingInvoices?.length === 0) {
    return (
      <div className="p-20">
        <p className="text-center text-2xl font-bold text-gray-500">
          No tienes pagos pendientes
        </p>
      </div>
    );
  }

  return invoices?.map((invoice) => {
    if (invoice && invoice.status === "pending") {
      return (
        <div key={invoice.id} className="container p-4 md:p-6">
          <PendingPayment
            festival={festival}
            invoice={invoice}
            profile={profile}
          />
        </div>
      );
    }
  });
}
