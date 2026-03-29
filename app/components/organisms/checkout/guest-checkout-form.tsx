"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheckIcon, Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import Heading from "@/app/components/atoms/heading";
import PhoneInput from "@/app/components/form/fields/phone";
import TextInput from "@/app/components/form/fields/text";
import {
	nameValidator,
	phoneValidator,
} from "@/app/components/form/input-validators";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import { Form } from "@/app/components/ui/form";
import { checkoutGuestCart } from "@/app/lib/cart/actions";
import type { GuestCartItem } from "@/app/lib/cart/definitions";

const GuestFormSchema = z.object({
	name: nameValidator(),
	email: z.email("Ingresá un email válido"),
	phone: phoneValidator(),
});

type GuestFormValues = z.infer<typeof GuestFormSchema>;

type GuestCheckoutFormProps = {
	guestItems: GuestCartItem[];
	clearGuestCart: () => void;
};

export function GuestCheckoutForm({
	guestItems,
	clearGuestCart,
}: GuestCheckoutFormProps) {
	const router = useRouter();
	const isSubmittingRef = useRef(false);
	const [loading, setLoading] = useState(false);

	const form = useForm<GuestFormValues>({
		resolver: zodResolver(GuestFormSchema),
		defaultValues: { name: "", email: "", phone: "" },
	});

	async function handleSubmit(values: GuestFormValues) {
		if (isSubmittingRef.current) return;
		isSubmittingRef.current = true;
		setLoading(true);

		try {
			const result = await checkoutGuestCart(
				guestItems.map((i) => ({
					productId: i.productId,
					quantity: i.quantity,
				})),
				values.name,
				values.email,
				values.phone,
			);

			if (result.success && result.orderId && result.guestOrderToken) {
				clearGuestCart();
				router.push(
					`/orders/${result.orderId}/payment?token=${result.guestOrderToken}`,
				);
			} else {
				toast.error(result.message);
				setLoading(false);
				isSubmittingRef.current = false;
			}
		} catch {
			toast.error("Error al procesar el pedido. Intenta de nuevo.");
			setLoading(false);
			isSubmittingRef.current = false;
		}
	}

	return (
		<Card>
			<CardContent className="p-6">
				<Heading level={4} className="mb-4">
					Tus datos de contacto
				</Heading>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(handleSubmit)}
						className="flex flex-col gap-4"
					>
						<TextInput
							name="name"
							label="Nombre completo"
							placeholder="Tu nombre"
							autoComplete="name"
							type="text"
						/>

						<TextInput
							name="email"
							label="Correo electrónico"
							placeholder="tu@email.com"
							autoComplete="email"
							type="email"
						/>
						<PhoneInput name="phone" label="Número de teléfono" />

						<div className="fixed bottom-0 left-0 right-0 bg-background border-t px-4 py-4 z-40 md:static md:border-0 md:px-0 md:py-0 md:bg-transparent">
							<Button
								type="submit"
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
						</div>
					</form>
				</Form>
			</CardContent>
		</Card>
	);
}
