import InvoicePaymentSuccess from "@/app/components/organisms/payments/invoice-payment-success";
import { fetchInvoice } from "@/app/data/invoices/actions";
import { fetchProducts } from "@/app/lib/products/actions";
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
	const productsPromise = fetchProducts();

	return (
		<div className="container p-3 md:p-6">
			<div className="w-full max-w-md space-y-8 mx-auto">
				<div className="text-center space-y-4">
					<div className="flex justify-center">
						<CheckCircleIcon className="h-16 w-16 text-green-500" />
					</div>
					<h1 className="text-3xl font-bold">¡Pago Exitoso!</h1>
					<p className="text-gray-500">
						Gracias por tu pago. Tu reserva será confirmada en las próximas 48
						horas.
					</p>
				</div>
				<Suspense fallback={<div>Loading...</div>}>
					<InvoicePaymentSuccess
						profile={currentUser!}
						invoicePromise={invoicePromise}
						productsPromise={productsPromise}
					/>
				</Suspense>
			</div>
		</div>
	);
}
