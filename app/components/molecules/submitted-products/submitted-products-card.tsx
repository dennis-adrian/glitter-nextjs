import SubmittedProductCard from "@/app/components/molecules/submitted-products/submitted-product-card";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { fetchParticipantProducts } from "@/app/lib/participant_products/actions";

type SubmittedProductsCardProps = {
	profileId: number;
	festivalId: number;
};
export default async function SubmittedProductsCard({
	profileId,
	festivalId,
}: SubmittedProductsCardProps) {
	const submittedProducts = await fetchParticipantProducts(
		profileId,
		festivalId,
	);

	if (submittedProducts.length === 0) return null;

	return (
		<Card>
			<CardHeader className="p-4">
				<CardTitle className="text-base md:text-lg">
					Productos Guardados
				</CardTitle>
				<CardDescription>
					Rastrea el estado de tus productos guardados
				</CardDescription>
			</CardHeader>
			<CardContent className="p-4 pt-0">
				<div className="flex flex-col gap-2 md:gap-4">
					{submittedProducts.map((product) => (
						<SubmittedProductCard key={product.id} product={product} />
					))}
				</div>
			</CardContent>
		</Card>
	);
}
