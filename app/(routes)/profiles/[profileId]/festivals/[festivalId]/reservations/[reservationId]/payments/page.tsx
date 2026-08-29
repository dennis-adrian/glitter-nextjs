import { PaymentSummary } from "@/app/components/payments/payment-summary";
import { ProductDetails } from "@/app/components/payments/product-details";
import { fetchInvoicesByReservation } from "@/app/data/invoices/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import QRCodeDetails from "@/app/components/payments/qrcode-details";
import FreeReservationDetails from "@/app/components/payments/free-reservation-details";
import { fetchBaseFestival } from "@/app/lib/festivals/actions";
import StepIndicator from "@/app/components/festivals/reservations/step-indicator";

const ParamsSchema = z.object({
  festivalId: z.coerce.number(),
  profileId: z.coerce.number(),
  reservationId: z.coerce.number(),
});

export default async function Page(props: {
  params: Promise<{
    festivalId: string;
    profileId: string;
    reservationId: string;
  }>;
}) {
  const params = await props.params;
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) redirect("/");

  const profile = await getCurrentUserProfile();
  const festival = await fetchBaseFestival(validatedParams.data.festivalId);
  if (!festival || !profile) notFound();
  await protectRoute(profile, validatedParams.data.profileId);

  const invoices = await fetchInvoicesByReservation(
    validatedParams.data.reservationId,
  );
  if (invoices.length === 0) notFound();

  const ownerInvoices = invoices.filter(
    (invoice) => invoice.userId === profile.id,
  );
  const isOwner = ownerInvoices.length > 0;
  const visibleInvoices = isOwner ? ownerInvoices : invoices;

  if (!isOwner) {
    return (
      <>
        <StepIndicator
          step={3}
          totalSteps={3}
          backLabel="Ver mi reserva"
          backHref="/my_profile"
        />
        <div className="container p-4 md:p-6">
          <h1 className="text-3xl font-bold mb-4">Factura de la reserva</h1>
          <p className="text-muted-foreground mb-8">
            Podés ver el estado del pago, pero solo quien figura en la factura
            puede enviar el comprobante.
          </p>
          {visibleInvoices.map((invoice) => (
            <div key={invoice.id} className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <ProductDetails festival={festival} invoice={invoice} />
              <PaymentSummary
                invoice={invoice}
                festivalId={validatedParams.data.festivalId}
              />
            </div>
          ))}
        </div>
      </>
    );
  }

  const pendingInvoices = ownerInvoices.filter(
    (invoice) => invoice.status === "pending",
  );

  if (pendingInvoices.length === 0) {
    return (
      <>
        <StepIndicator
          step={3}
          totalSteps={3}
          backLabel="Ver mi reserva"
          backHref="/my_profile"
        />
        <div className="p-20">
          <p className="text-center text-2xl font-bold text-gray-500">
            No tenés pagos pendientes
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <StepIndicator
        step={3}
        totalSteps={3}
        backLabel="Ver mi reserva"
        backHref="/my_profile"
      />
      {ownerInvoices.map((invoice) => {
        if (invoice && invoice.status === "pending") {
          return (
            <div key={invoice.id} className="container p-4 md:p-6">
              <h1 className="text-3xl font-bold mb-8">
                {invoice.amount === 0
                  ? "Solicitá la revisión de tu reserva"
                  : "Completá el pago"}
              </h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex flex-col gap-6">
                  <ProductDetails festival={festival} invoice={invoice} />
                  <PaymentSummary
                    invoice={invoice}
                    festivalId={validatedParams.data.festivalId}
                  />
                </div>

                {invoice.amount === 0 ? (
                  <FreeReservationDetails invoice={invoice} />
                ) : (
                  <QRCodeDetails invoice={invoice} />
                )}
              </div>
            </div>
          );
        }
      })}
    </>
  );
}
