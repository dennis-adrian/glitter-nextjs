import { PaymentSummary } from "@/app/components/payments/payment-summary";
import { ProductDetails } from "@/app/components/payments/product-details";
import QRCodeDetails from "@/app/components/payments/qrcode-details";
import { fetchInvoicesByReservation } from "@/app/data/invoices/actions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
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
          <h1 className="text-3xl font-bold mb-8">Completa tu Pago</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-6">
              <ProductDetails festival={festival} invoice={invoice} />
              <PaymentSummary invoice={invoice} />
            </div>

            <QRCodeDetails invoice={invoice} />
          </div>
        </div>
      );
    }
  });
}
