import PendingPayment from "@/app/components/payments/pending-payment";
import { fetchLatestInvoiceByProfileId } from "@/app/data/invoices/actions";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { redirect } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
  id: z.coerce.number(),
});

export default async function Page({ params }: { params: { id: string } }) {
  const validatedParams = ParamsSchema.safeParse(params);
  if (!validatedParams.success) redirect("/");

  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/");
  if (profile.role !== "admin" && profile.id !== validatedParams.data.id)
    redirect("/user_profile");

  const invoice = await fetchLatestInvoiceByProfileId(profile.id);

  if (invoice && invoice.status === "pending") {
    return (
      <div className="container p-4 md:p-6">
        <PendingPayment invoice={invoice} profile={profile} />
      </div>
    );
  }

  return (
    <div className="p-20">
      <p className="text-center text-2xl font-bold text-gray-500">
        No tienes pagos pendientes
      </p>
    </div>
  );
}
