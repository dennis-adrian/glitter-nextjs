"use client";

import DeleteProductModal from "@/app/components/organisms/products/delete-product-modal";
import { Badge } from "@/app/components/ui/badge";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { cn } from "@/lib/utils";
import { EditIcon, StarIcon, Trash2Icon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use, useState } from "react";

const STATUS_LABELS: Record<string, string> = {
	available: "Disponible",
	presale: "Preventa",
	sale: "En oferta",
};

function ProductCard({ product }: { product: BaseProductWithImages }) {
	const [openDelete, setOpenDelete] = useState(false);
	const mainImage = product.images.find((img) => img.isMain);
	const imageUrl = mainImage?.imageUrl ?? product.images[0]?.imageUrl;
	const stock = product.stock ?? 0;

	return (
		<>
			<Card className="overflow-hidden">
				<div className="relative aspect-square w-full bg-muted">
					{imageUrl ? (
						<Image
							src={imageUrl}
							alt={product.name}
							fill
							className="object-cover"
						/>
					) : (
						<div className="flex h-full items-center justify-center text-xs text-muted-foreground">
							Sin imagen
						</div>
					)}
					{product.isFeatured && (
						<div className="absolute top-2 left-2">
							<StarIcon className="h-4 w-4 text-amber-500 fill-amber-500 drop-shadow" />
						</div>
					)}
				</div>
				<CardContent className="p-3 flex flex-col gap-2">
					<p className="text-sm font-medium leading-tight line-clamp-2">
						{product.name}
					</p>
					<div className="flex items-center justify-between gap-2">
						<span className="text-sm font-semibold">
							Bs {product.price.toFixed(2)}
						</span>
						<Badge
							variant="outline"
							className={cn(
								"text-xs",
								stock === 0
									? "border-red-300 text-red-600"
									: stock <= 5
										? "border-amber-300 text-amber-600"
										: "border-green-300 text-green-600",
							)}
						>
							{stock} unid.
						</Badge>
					</div>
					<Badge variant="outline" className="self-start text-xs">
						{STATUS_LABELS[product.status] ?? product.status}
					</Badge>
					<div className="flex gap-2 mt-1">
						<Button
							asChild
							variant="outline"
							size="sm"
							className="flex-1 min-h-10"
						>
							<Link href={`/dashboard/store/products/${product.id}/edit`}>
								<EditIcon className="h-4 w-4 mr-1" />
								Editar
							</Link>
						</Button>
						<Button
							variant="outline"
							size="sm"
							className="min-h-10 text-destructive border-destructive/30 hover:bg-destructive/10"
							aria-label={`Eliminar producto ${product.name}`}
							onClick={() => setOpenDelete(true)}
						>
							<Trash2Icon className="h-4 w-4" />
						</Button>
					</div>
				</CardContent>
			</Card>
			<DeleteProductModal
				product={product}
				open={openDelete}
				setOpen={setOpenDelete}
			/>
		</>
	);
}

type ProductsCardGridProps = {
	productsPromise: Promise<BaseProductWithImages[]>;
};

export default function ProductsCardGrid({
	productsPromise,
}: ProductsCardGridProps) {
	const products = use(productsPromise);

	if (products.length === 0) {
		return (
			<p className="text-center text-sm text-muted-foreground py-12">
				No hay productos. ¡Agrega el primero!
			</p>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-3">
			{products.map((product) => (
				<ProductCard key={product.id} product={product} />
			))}
		</div>
	);
}
