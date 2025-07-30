import SubmittedProductCard from "@/app/components/molecules/submitted-products/submitted-product-card";
import { fetchParticipantProductsByParticipationId } from "@/app/lib/participant_products/actions";
import { notFound } from "next/navigation";
import { z } from "zod";

const ParamsSchema = z.object({
	profileId: z.coerce.number(),
	participationId: z.coerce.number(),
});

export default async function SubmittedProductsPage(props: {
	params: Promise<z.infer<typeof ParamsSchema>>;
}) {
	const params = await props.params;
	const validatedParams = ParamsSchema.safeParse(params);

	if (!validatedParams.success) {
		return notFound();
	}

	const products = await fetchParticipantProductsByParticipationId(
		validatedParams.data.profileId,
		validatedParams.data.participationId,
	);

	return (
		<div className="container p-3 md:p-6">
			<h1 className="text-lg md:text-2xl font-bold my-3">Productos subidos</h1>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
				{products.map((product) => (
					<SubmittedProductCard key={product.id} product={product} />
				))}
			</div>
		</div>
	);
}
