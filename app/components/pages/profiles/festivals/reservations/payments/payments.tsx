import { PaymentSummary } from "@/app/components/payments/payment-summary";
import { ProductDetails } from "@/app/components/payments/product-details";
import QRCodeDetails from "@/app/components/payments/qrcode-details";
import InvoiceUnderReviewPanel from "@/app/components/payments/invoice-under-review-panel";
import {
  fetchInvoiceTenderSummary,
  fetchInvoicesByReservation,
} from "@/app/data/invoices/actions";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import { canSubmitInvoiceSettlement } from "@/app/lib/reservations/policy";
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
  const actionableInvoices = invoices?.filter(
    (invoice) =>
      invoice.status === "pending" || invoice.status === "verification_payment",
  );

  if (!actionableInvoices || actionableInvoices.length === 0) {
    return (
      <div className="p-20">
        <p className="text-center text-2xl font-bold text-gray-500">
          No tenés pagos pendientes
        </p>
      </div>
    );
  }

  return Promise.all(
    actionableInvoices.map(async (invoice) => {
      const underReview = invoice.status === "verification_payment";
      const tender = await fetchInvoiceTenderSummary(invoice.id);
      const outstandingAmount = tender?.outstandingAmount ?? invoice.amount;
      const canSettle = canSubmitInvoiceSettlement({
        actor: { id: profile.id, role: profile.role },
        invoiceOwnerUserId: invoice.userId,
      });
      return (
        <div key={invoice.id} className="container p-4 md:p-6">
          <h1 className="text-3xl font-bold mb-8">
            {underReview ? "Tu pago está en revisión" : "Completá el pago"}
          </h1>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-6">
              <ProductDetails festival={festival} invoice={invoice} />
              <PaymentSummary
                invoice={invoice}
                festivalId={festival.id}
                approvedCashAmount={tender?.approvedCashAmount}
                creditAppliedAmount={tender?.confirmedCreditAmount}
                outstandingAmount={outstandingAmount}
              />
            </div>

            {underReview ? (
              <InvoiceUnderReviewPanel
                invoice={invoice}
                allowReplace={canSettle}
                showVoucher={canSettle}
              />
            ) : canSettle ? (
              <QRCodeDetails
                invoice={invoice}
                outstandingAmount={outstandingAmount}
              />
            ) : (
              <PaymentSummary
                invoice={invoice}
                festivalId={festival.id}
                // Without the tender the defaults show the full total, which
                // contradicts the summary beside it on the same screen.
                approvedCashAmount={tender?.approvedCashAmount}
                creditAppliedAmount={tender?.confirmedCreditAmount}
                outstandingAmount={outstandingAmount}
              />
            )}
          </div>
        </div>
      );
    }),
  );
}
