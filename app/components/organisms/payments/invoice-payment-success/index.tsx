"use client";

import CreateOrderForm from "@/app/components/organisms/payments/invoice-payment-success/create-order-form";
import InvoiceSummaryCard from "@/app/components/organisms/payments/invoice-payment-success/invoice-summary-card";
import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/app/components/ui/card";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";
import { BaseProduct } from "@/app/lib/products/definitions";
import { CheckCircleIcon, UserIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { use, useState } from "react";

type InvoicePaymentSuccessProps = {
	invoicePromise: Promise<InvoiceWithPaymentsAndStand | null | undefined>;
	productsPromise: Promise<BaseProduct[]>;
	profileId: number;
};
export default function InvoicePaymentSuccess(
	props: InvoicePaymentSuccessProps,
) {
	const { profileId, invoicePromise, productsPromise } = props;
	const invoice = use(invoicePromise);
	const products = use(productsPromise);
	const [isAdded, setIsAdded] = useState(false);
	const [isAdding, setIsAdding] = useState(false);

	if (!invoice) {
		return null;
	}

	return (
		<>
			<InvoiceSummaryCard invoice={invoice} />
			{!isAdded && products.length > 0 ? (
				<Card className="border-2 border-dashed border-gray-200 bg-gray-50">
					<CardHeader>
						<CardTitle className="text-lg">Te puede interesar</CardTitle>
						{/* <CardDescription>
							Estos productos te pueden interesar
						</CardDescription> */}
					</CardHeader>
					<CardContent>
						{products.map((product) => (
							<div key={product.id}>
								<div className="flex gap-4">
									<div className="w-28 h-28 bg-gray-100 rounded-md flex items-center justify-center">
										<Image
											src={product.imageUrl ?? ""}
											alt={product.name}
											width={112}
											height={112}
											className="object-cover"
										/>
									</div>
									<div className="flex-1">
										<h3 className="font-medium">{product.name}</h3>
										<p className="text-sm text-gray-500 mb-2">
											{product.description}
										</p>
									</div>
								</div>
								<CreateOrderForm profileId={profileId} product={product} />
							</div>
						))}
					</CardContent>
				</Card>
			) : (
				<div className="flex justify-center">
					<CheckCircleIcon className="h-4 w-4 text-green-500" />
					<p>Added to your order!</p>
				</div>
			)}

			<div className="flex justify-center">
				<RedirectButton href="/my_profile" className="gap-2" variant="outline">
					<UserIcon className="h-4 w-4" />
					Ir a mi perfil
				</RedirectButton>
			</div>
		</>
	);
}
