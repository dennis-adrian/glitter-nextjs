import Heading from "@/app/components/atoms/heading";
import { RedirectButton } from "@/app/components/redirect-button";

export function CheckoutEmptyCart() {
	return (
		<div className="container mx-auto p-3 md:p-6">
			<Heading level={1} className="text-2xl font-bold">
				No tenés productos en el carrito
			</Heading>
			<p className="text-muted-foreground text-sm">
				Agregá productos a tu carrito para continuar con la compra.
			</p>
			<RedirectButton href="/store" className="mt-4">
				Ir a la tienda
			</RedirectButton>
		</div>
	);
}
