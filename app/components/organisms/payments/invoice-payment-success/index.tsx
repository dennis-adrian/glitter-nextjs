"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import StoreItemCard from "@/app/components/molecules/store-item-card";
import InvoiceSummaryCard from "@/app/components/organisms/payments/invoice-payment-success/invoice-summary-card";
import { RedirectButton } from "@/app/components/redirect-button";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { UserIcon } from "lucide-react";
import { use } from "react";

type InvoicePaymentSuccessProps = {
	invoicePromise: Promise<InvoiceWithPaymentsAndStand | null | undefined>;
	productsPromise: Promise<BaseProductWithImages[]>;
	profile: BaseProfile;
};

export default function InvoicePaymentSuccess(
	props: InvoicePaymentSuccessProps,
) {
	const { profile, invoicePromise, productsPromise } = props;
	const invoice = use(invoicePromise);
	const products = use(productsPromise);

	if (!invoice) {
		return null;
	}

	return (
		<>
			<InvoiceSummaryCard invoice={invoice} />
			{products.length > 0 && (
				<div className="space-y-4">
					<div>
						<h2 className="text-lg font-semibold">
							También podría interesarte
						</h2>
						<p className="text-sm text-muted-foreground">
							Productos del festival disponibles
						</p>
					</div>
					<div className="max-w-xs mx-auto">
						{products.map((product) => (
							<StoreItemCard
								key={product.id}
								product={product}
								user={profile}
							/>
						))}
					</div>
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
