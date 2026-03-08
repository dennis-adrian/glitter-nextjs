"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon, ShoppingBagIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/app/components/ui/button";
import { checkoutCart } from "@/app/lib/cart/actions";

type Props = {
	userId: number;
	email: string;
	name: string;
};

export default function CheckoutConfirmButton({ userId, email, name }: Props) {
	const [loading, setLoading] = useState(false);
	const router = useRouter();

	async function handleConfirm() {
		setLoading(true);
		try {
			const result = await checkoutCart(userId, email, name);
			if (result.success && result.orderId) {
				router.push(`/profiles/${userId}/orders/${result.orderId}`);
			} else {
				toast.error(result.message);
				setLoading(false);
			}
		} catch (error) {
			toast.error("Error al procesar el pedido. Intenta de nuevo.");
			setLoading(false);
		}
	}

	return (
		<Button
			onClick={handleConfirm}
			disabled={loading}
			className="w-full bg-purple-600 hover:bg-purple-700"
			size="lg"
		>
			{loading ? (
				<span className="flex items-center gap-2">
					<Loader2Icon className="w-4 h-4 animate-spin" />
					Procesando...
				</span>
			) : (
				<span className="flex items-center gap-2">
					<ShoppingBagIcon className="w-4 h-4" />
					Confirmar pedido
				</span>
			)}
		</Button>
	);
}
