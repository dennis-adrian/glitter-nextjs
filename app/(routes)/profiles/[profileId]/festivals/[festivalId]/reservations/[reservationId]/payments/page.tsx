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
	const pendingInvoices = invoices?.filter(
		(invoice) => invoice.status === "pending",
	);

	if (pendingInvoices?.length === 0) {
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
						No tienes pagos pendientes
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
			{invoices?.map((invoice) => {
				if (invoice && invoice.status === "pending") {
					return (
						<div key={invoice.id} className="container p-4 md:p-6">
							<h1 className="text-3xl font-bold mb-8">
								{invoice.amount === 0 ? "Confirma tu Reserva" : "Completa tu Pago"}
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
