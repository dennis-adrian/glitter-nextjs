import { ArrowLeftIcon, ClockIcon } from "lucide-react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { z } from "zod";

import Heading from "@/app/components/atoms/heading";
import StoreItemQuantityInput from "@/app/components/molecules/store-item-quantity-input";
import StoreProductImages from "@/app/components/molecules/store-product-images";
import { formatDate } from "@/app/lib/formatters";
import { validatedDiscount } from "@/app/lib/orders/utils";
import { fetchProduct, fetchProductBySlug } from "@/app/lib/products/actions";

const ParamsSchema = z.object({
	slug: z.string().min(1),
});

export default async function ProductDetailPage(props: {
	params: Promise<z.infer<typeof ParamsSchema>>;
}) {
	const params = await props.params;
	const validatedParams = ParamsSchema.safeParse(params);

	if (!validatedParams.success) {
		return notFound();
	}

	const raw = decodeURIComponent(validatedParams.data.slug);

	if (/^\d+$/.test(raw)) {
		const byId = await fetchProduct(Number(raw));
		if (!byId) {
			return notFound();
		}
		if (byId.slug !== raw) {
			permanentRedirect(`/store/products/${byId.slug}`);
		}
	}

	const product = await fetchProductBySlug(raw, { visibleOnly: true });

	if (!product) {
		return notFound();
	}

	let originalPrice: number | null = null;
	let price = product.price;

	if (product.discount && product.discountUnit === "percentage") {
		const validDiscount = validatedDiscount(
			product.price,
			product.discount,
			product.discountUnit,
		);
		originalPrice = product.price;
		price = product.price * (1 - validDiscount / 100);
	} else if (product.discount && product.discountUnit === "amount") {
		const validDiscount = validatedDiscount(
			product.price,
			product.discount,
			product.discountUnit,
		);
		originalPrice = product.price;
		price = product.price - validDiscount;
	}

	return (
		<div className="container px-3 py-6">
			<Link
				href="/store"
				className="text-sm text-muted-foreground flex items-center gap-1 mb-6 hover:text-foreground transition-colors"
			>
				<ArrowLeftIcon className="h-3.5 w-3.5" />
				Volver a la tienda
			</Link>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
				<StoreProductImages
					productName={product.name}
					stock={product.stock ?? 0}
					images={product.images}
				/>

				<div className="flex flex-col gap-4">
					<Heading level={2}>{product.name}</Heading>

					{product.description && (
						<p className="text-muted-foreground text-sm leading-relaxed">
							{product.description}
						</p>
					)}

					<div className="flex items-baseline gap-2">
						<span className="text-3xl font-semibold">Bs{price.toFixed(2)}</span>
						{originalPrice && (
							<span className="text-base text-muted-foreground line-through">
								Bs{originalPrice.toFixed(2)}
							</span>
						)}
					</div>

					{product.isPreOrder && product.availableDate && (
						<p className="text-sm text-muted-foreground flex items-center gap-1">
							<ClockIcon className="w-4 h-4" />
							Disponible el{" "}
							{formatDate(product.availableDate).toLocaleString({
								month: "long",
								day: "numeric",
								year: "numeric",
							})}
						</p>
					)}

					<StoreItemQuantityInput product={product} />
				</div>
			</div>
		</div>
	);
}
