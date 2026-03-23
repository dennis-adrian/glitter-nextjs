import Heading from "@/app/components/atoms/heading";
import InvoicePaymentSuccess from "@/app/components/organisms/payments/invoice-payment-success";
import { fetchInvoice } from "@/app/data/invoices/actions";
import { fetchFeaturedProducts } from "@/app/lib/products/actions";
import { getCurrentUserProfile, protectRoute } from "@/app/lib/users/helpers";
import { CheckCircleIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
	invoiceId: z.coerce.number(),
});

export default async function UserInvoicesPage(props: {
	params: Promise<z.infer<typeof ParamsSchema>>;
}) {
	const params = await props.params;
	const validatedParams = ParamsSchema.safeParse(params);
	if (!validatedParams.success) {
		return notFound();
	}

	const currentUser = await getCurrentUserProfile();
	await protectRoute(currentUser || undefined, validatedParams.data.profileId);

	const invoicePromise = fetchInvoice(params.invoiceId);
	const productsPromise = fetchFeaturedProducts();
	const initialItemCount = 0;

	return (
		<div className="container p-3 md:p-6">
			<div className="flex flex-col gap-6 md:gap-8">
				<div className="text-center flex flex-col gap-3 md:gap-4 mt-3">
					<div className="flex justify-center">
						<CheckCircleIcon className="h-14 w-14 md:h-16 md:w-16 text-green-500" />
					</div>
					<Heading level={2}>¡Pago Exitoso!</Heading>
					<p className="text-muted-foreground text-sm md:text-base">
						Gracias por tu pago. Tu reserva será confirmada en las próximas 48
						horas.
					</p>
				</div>
				<Suspense fallback={<div>Cargando...</div>}>
					<InvoicePaymentSuccess
						invoicePromise={invoicePromise}
						productsPromise={productsPromise}
						initialItemCount={initialItemCount}
					/>
				</Suspense>
			</div>
		</div>
	);
}
