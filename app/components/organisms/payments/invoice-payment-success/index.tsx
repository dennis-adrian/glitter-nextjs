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
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/app/components/ui/dialog";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/defiinitions";
import { BaseProduct } from "@/app/lib/products/definitions";
import { CheckCircleIcon, UserIcon, XIcon, ZoomInIcon } from "lucide-react";
import Image from "next/image";
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
	const [imageOpen, setImageOpen] = useState(false);
	const [selectedProduct, setSelectedProduct] = useState<BaseProduct | null>(
		null,
	);

	if (!invoice) {
		return null;
	}

	// This is the card the would show users the products that they can buy from the store after making their payment

	// {!isAdded && products.length > 0 ? (
	// 	<Card className="border-2 border-dashed border-gray-200 bg-gray-50">
	// 		<CardHeader>
	// 			<CardTitle className="text-lg">Te puede interesar</CardTitle>
	// 			{/* <CardDescription>
	// 				Estos productos te pueden interesar
	// 			</CardDescription> */}
	// 		</CardHeader>
	// 		<CardContent>
	// 			{products.map((product) => (
	// 				<div key={product.id}>
	// 					<div className="flex gap-4">
	// 						<div className="w-28 h-28 bg-gray-100 rounded-md flex items-center justify-center relative group">
	// 							<Image
	// 								src={product.imageUrl ?? ""}
	// 								alt={product.name}
	// 								width={112}
	// 								height={112}
	// 								className="object-cover"
	// 							/>
	// 							<div
	// 								className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer"
	// 								onClick={() => {
	// 									setSelectedProduct(product);
	// 									setImageOpen(true);
	// 								}}
	// 							>
	// 								<ZoomInIcon className="h-6 w-6 text-white drop-shadow-md" />
	// 							</div>
	// 						</div>
	// 						<div className="flex-1">
	// 							<h3 className="font-medium">{product.name}</h3>
	// 							<p className="text-sm text-gray-500 mb-2">
	// 								{product.description}
	// 							</p>
	// 						</div>
	// 					</div>
	// 					<CreateOrderForm profileId={profileId} product={product} />
	// 				</div>
	// 			))}
	// 		</CardContent>
	// 	</Card>
	// ) : (
	// 	<div className="flex justify-center">
	// 		<CheckCircleIcon className="h-4 w-4 text-green-500" />
	// 		<p>Added to your order!</p>
	// 	</div>
	// )}

	return (
		<>
			<InvoiceSummaryCard invoice={invoice} />
			<div className="flex justify-center">
				<RedirectButton href="/my_profile" className="gap-2" variant="outline">
					<UserIcon className="h-4 w-4" />
					Ir a mi perfil
				</RedirectButton>
			</div>
			{/* Full Screen Image Modal */}
			<Dialog open={imageOpen} onOpenChange={setImageOpen}>
				<DialogContent className="max-w-4xl p-0 overflow-auto border-none bg-black/80">
					<DialogClose className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground z-10">
						<XIcon className="h-6 w-6 text-white" />
						<span className="sr-only">Close</span>
					</DialogClose>
					<div className="flex items-center justify-center w-full h-full p-6">
						<div className="relative">
							<Image
								src={selectedProduct?.imageUrl ?? ""}
								alt={selectedProduct?.name ?? ""}
								width={0}
								height={0}
								className="w-auto h-auto max-w-none"
								sizes="80vw"
								priority
							/>
						</div>
					</div>
					<div className="bg-black p-4">
						<DialogTitle className="text-white text-xl">
							{selectedProduct?.name}
						</DialogTitle>
						<DialogDescription className="text-gray-300">
							{selectedProduct?.description}
						</DialogDescription>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
