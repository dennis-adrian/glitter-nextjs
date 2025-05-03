import InvoiceSummaryCard from "@/app/components/organisms/payments/invoice-summary-card";
import { CheckCircleIcon } from "lucide-react";
import { notFound } from "next/navigation";
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
				<InvoiceSummaryCard invoiceId={params.invoiceId} />
			</div>
		</div>
	);
}
