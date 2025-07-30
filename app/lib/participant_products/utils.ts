import { ParticipantProduct } from "@/app/lib/participant_products/definitions";

export function groupProductsByStatus(
	products: ParticipantProduct[],
): Record<ParticipantProduct["submissionStatus"], ParticipantProduct[]> {
	const groupedProducts = products.reduce(
		(acc, product) => {
			acc[product.submissionStatus] = acc[product.submissionStatus] || [];
			acc[product.submissionStatus].push(product);
			return acc;
		},
		{} as Record<ParticipantProduct["submissionStatus"], ParticipantProduct[]>,
	);

	return {
		rejected: groupedProducts.rejected || [],
		pending_review: groupedProducts.pending_review || [],
		approved: groupedProducts.approved || [],
	};
}
