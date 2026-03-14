"use client";

import { Badge } from "@/app/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { BaseProduct } from "@/app/lib/products/definitions";
import { AlertTriangleIcon } from "lucide-react";
import Link from "next/link";
import { use } from "react";

type LowStockAlertProps = {
	lowStockPromise: Promise<BaseProduct[]>;
};

export default function LowStockAlert({ lowStockPromise }: LowStockAlertProps) {
	const products = use(lowStockPromise);

	if (products.length === 0) return null;

	return (
		<Card className="border-amber-200">
			<CardHeader className="p-4 pb-2">
				<div className="flex items-center gap-2">
					<AlertTriangleIcon className="h-5 w-5 text-amber-600" />
					<CardTitle className="text-base text-amber-700">
						Stock bajo ({products.length}{" "}
						{products.length === 1 ? "producto" : "productos"})
					</CardTitle>
				</div>
			</CardHeader>
			<CardContent className="p-4 pt-0">
				<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
					{products.map((product) => (
						<Link
							key={product.id}
							href={`/dashboard/store/products/${product.id}/edit`}
							className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-accent transition-colors"
						>
							<span className="text-sm font-medium truncate mr-2">
								{product.name}
							</span>
							<Badge
								variant={
									product.stock === 0 ? "destructive" : "outline"
								}
								className={
									product.stock !== 0 && product.stock !== null
										? "text-amber-600 border-amber-300"
										: undefined
								}
							>
								{product.stock ?? 0} unid.
							</Badge>
						</Link>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
