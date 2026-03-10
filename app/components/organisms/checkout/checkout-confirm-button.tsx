"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/app/components/providers/cart-provider";
import { Button } from "@/app/components/ui/button";
import { checkoutCart } from "@/app/lib/cart/actions";

export default function CheckoutConfirmButton() {
	const [loading, setLoading] = useState(false);
	const router = useRouter();
	const { setItemCount } = useCart();

	async function handleConfirm() {
		setLoading(true);
		try {
			const result = await checkoutCart();
			if (result.success && result.orderId && result.profileId) {
				setItemCount(0);
				router.push(
					`/profiles/${result.profileId}/orders/${result.orderId}/pay`,
				);
			} else {
				toast.error(result.message);
			}
		} catch (error) {
			toast.error("Error al procesar el pedido. Intenta de nuevo.");
		} finally {
			setLoading(false);
		}
	}

	return (
		<Button
			onClick={handleConfirm}
			disabled={loading}
			className="w-full bg-primary hover:bg-primary/90"
			size="lg"
		>
			{loading ? (
				<span className="flex items-center gap-2">
					<Loader2Icon className="w-4 h-4 animate-spin" />
					Procesando...
				</span>
			) : (
				<span className="flex items-center gap-2">
					<CircleCheckIcon className="w-4 h-4" />
					Confirmar pedido
				</span>
			)}
		</Button>
	);
}
