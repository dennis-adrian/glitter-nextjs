import PendingPayment from "@/app/components/payments/pending-payment";
import { fetchBaseFestival } from "@/app/data/festivals/actions";
import { fetchInvoicesByReservation } from "@/app/data/invoices/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  festivalId: z.coerce.number(),
  reservationId: z.coerce.number(),
});

export default async function Page({
  params,
}: {
  params: { festivalId: string; reservationId: string };
}) {
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) redirect("/");

  const profile = await getCurrentUserProfile();
  const festival = await fetchBaseFestival(validatedParams.data.festivalId);
  if (!festival || !profile) notFound();

  const invoices = await fetchInvoicesByReservation(
    validatedParams.data.reservationId,
  );
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
