"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheckIcon, Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import Heading from "@/app/components/atoms/heading";
import { CheckoutPageLayout } from "@/app/components/organisms/checkout/checkout-page-layout";
import type { CheckoutLineItem } from "@/app/components/organisms/checkout/checkout-line-item";
import { useCartContext } from "@/app/components/providers/cart-provider";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent } from "@/app/components/ui/card";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { checkoutGuestCart } from "@/app/lib/cart/actions";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";

const GuestFormSchema = z.object({
	name: z.string().min(2, "Ingresá tu nombre completo"),
	email: z.email("Ingresá un email válido"),
	phone: z.string().min(6, "Ingresá tu número de teléfono"),
});

type GuestFormValues = z.infer<typeof GuestFormSchema>;

export default function GuestCheckoutView() {
	const router = useRouter();
	const { guestItems, clearGuestCart, guestCartHydrated } = useCartContext();
	const isSubmittingRef = useRef(false);
	const [loading, setLoading] = useState(false);

	const form = useForm<GuestFormValues>({
		resolver: zodResolver(GuestFormSchema),
		defaultValues: { name: "", email: "", phone: "" },
	});

	useEffect(() => {
		if (guestCartHydrated && guestItems.length === 0) {
			router.replace("/store");
		}
	}, [guestCartHydrated, guestItems.length, router]);

	if (!guestCartHydrated || guestItems.length === 0) {
		return null;
	}

	const orderLines: CheckoutLineItem[] = guestItems.map((i) => ({
		key: i.productId,
		product: i.product,
		quantity: i.quantity,
	}));
	const presaleLines = orderLines.filter((l) => l.product.isPreOrder);

	const total = guestItems.reduce(
		(sum, i) => sum + getProductPriceAtPurchase(i.product) * i.quantity,
		0,
	);

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
		<CheckoutPageLayout
			orderSummaryItems={orderLines}
			total={total}
			presaleItems={presaleLines}
		>
			{/* Guest contact form */}
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
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Nombre completo</FormLabel>
										<FormControl>
											<Input
												placeholder="Tu nombre"
												autoComplete="name"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="email"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Correo electrónico</FormLabel>
										<FormControl>
											<Input
												type="email"
												placeholder="tu@email.com"
												autoComplete="email"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="phone"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Teléfono</FormLabel>
										<FormControl>
											<Input
												type="tel"
												placeholder="+591 xxxxxxxx"
												autoComplete="tel"
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>

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
		</CheckoutPageLayout>
	);
}
