"use client";

import Heading from "@/app/components/atoms/heading";
import StoreItemCard from "@/app/components/molecules/store-item-card";
import CartSheet from "@/app/components/organisms/cart/cart-sheet";
import {
	CartProvider,
	useCart,
} from "@/app/components/providers/cart-provider";
import { RedirectButton } from "@/app/components/redirect-button";
import { Button } from "@/app/components/ui/button";
import { InvoiceWithPaymentsAndStand } from "@/app/data/invoices/definitions";
import { BaseProductWithImages } from "@/app/lib/products/definitions";
import { ShoppingCartIcon, UserIcon } from "lucide-react";
import { use } from "react";

type InvoicePaymentSuccessProps = {
	invoicePromise: Promise<InvoiceWithPaymentsAndStand | null | undefined>;
	productsPromise: Promise<BaseProductWithImages[]>;
	initialItemCount: number;
};

function CartButton() {
	const { itemCount, openCart } = useCart();
	if (itemCount === 0) return null;
	return (
		<Button variant="outline" className="relative gap-2" onClick={openCart}>
			<ShoppingCartIcon className="w-4 h-4" />
			<span className="hidden sm:inline">Ver carrito</span>
			<span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-purple-600 text-[10px] font-bold text-white">
				{itemCount > 9 ? "9+" : itemCount}
			</span>
		</Button>
	);
}

export default function InvoicePaymentSuccess(
	props: InvoicePaymentSuccessProps,
) {
	const { invoicePromise, productsPromise, initialItemCount } = props;
	const invoice = use(invoicePromise);
	const products = use(productsPromise);

	if (!invoice) {
		return null;
	}

	return (
		<CartProvider initialItemCount={initialItemCount}>
			<CartSheet />
			{products.length > 0 && (
				<div className="flex flex-col gap-4">
					<div className="sticky top-16 md:top-20 z-40 bg-background border-b py-3 flex items-center justify-between">
						<div>
							<Heading level={3} className="text-primary-500">
								También podría interesarte
							</Heading>
							<p className="text-sm text-muted-foreground">
								Productos del festival disponibles
							</p>
						</div>
						<CartButton />
					</div>
					<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
						{products.map((product) => (
							<StoreItemCard key={product.id} product={product} />
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
		</CartProvider>
	);
}
