"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleCheckIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { Button } from "@/app/components/ui/button";
import { checkoutCart } from "@/app/lib/cart/actions";

export default function CheckoutConfirmButton() {
	const [loading, setLoading] = useState(false);
	const isSubmittingRef = useRef(false);
	const router = useRouter();
	const { setItemCount } = useCartContext();

	async function handleConfirm() {
		if (isSubmittingRef.current) return;
		isSubmittingRef.current = true;
		setLoading(true);
		try {
			const result = await checkoutCart();
			if (result.success && result.orderId && result.profileId) {
				setItemCount(0);
				router.push(`/orders/${result.orderId}/payment`);
				setLoading(false);
				isSubmittingRef.current = false;
			} else {
				toast.error(result.message);
				setLoading(false);
				isSubmittingRef.current = false;
			}
		} catch (error) {
			toast.error("Error al procesar el pedido. Intenta de nuevo.");
			setLoading(false);
			isSubmittingRef.current = false;
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
