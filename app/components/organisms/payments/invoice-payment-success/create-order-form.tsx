"use client";

import SubmitButton from "@/app/components/simple-submit-button";
import {
	Form,
	FormControl,
	FormItem,
	FormField,
	FormMessage,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { createOrder } from "@/app/lib/orders/actions";
import { NewOrderItem } from "@/app/lib/orders/definitions";
import { BaseProduct } from "@/app/lib/products/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const FormSchema = z.object({
	quantity: z
		.number({
			required_error: "La cantidad es requerida",
			invalid_type_error: "La cantidad debe ser un número",
		})
		.min(1, {
			message: "La cantidad debe ser mayor que 0",
		}),
});

type CreateOrderFormProps = {
	product: BaseProduct;
	profileId: number;
};
export default function CreateOrderForm(props: CreateOrderFormProps) {
	const { product, profileId } = props;
	const [subtotal, setSubtotal] = useState(product.price);
	const router = useRouter();
	const form = useForm<z.infer<typeof FormSchema>>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			quantity: 1,
		},
	});

	const action = form.handleSubmit(async (data) => {
		const orderItemsToInsert: NewOrderItem[] = [
			{
				productId: product.id,
				quantity: data.quantity,
				priceAtPurchase: product.price,
				// this is a temporary order id, it will be replaced with the actual order id after the order is created
				orderId: 0,
			},
		];

		const { success, message, details } = await createOrder(
			orderItemsToInsert,
			profileId,
			subtotal,
		);

		if (success && details?.orderId) {
			toast.success(message);
			form.reset();
			router.push(`/profiles/${profileId}/orders/${details.orderId}`);
		} else {
			form.setError("root", { message });
			toast.error(message);
		}
	});

	return (
		<Form {...form}>
			<form className="grid gap-4 w-full my-4" onSubmit={action}>
				<div className="grid grid-cols-2 gap-2">
					<span className="font-semibold ml-1">Bs{product.price}.00</span>
					<div className="flex flex-col gap-1 justify-center items-end">
						<FormField
							control={form.control}
							name="quantity"
							render={({ field }) => (
								<FormItem>
									<FormControl>
										<div className="flex items-center justify-end gap-2 w-80">
											<span className="text-xs text-muted-foreground">
												Cantidad
											</span>
											<Input
												className="w-16"
												type="number"
												placeholder="0"
												{...field}
												onChange={(e) => {
													const value = parseInt(e.target.value);
													setSubtotal((value || 0) * product.price);
													field.onChange(value);
												}}
											/>
										</div>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						{subtotal > 0 && (
							<span className="text-sm text-right">
								Subtotal: Bs{subtotal}.00
							</span>
						)}
					</div>
				</div>
				<SubmitButton
					disabled={
						form.formState.isSubmitting || form.formState.isSubmitSuccessful
					}
					loading={form.formState.isSubmitting}
					loadingLabel="Confirmando pedido..."
				>
					<PlusIcon className="w-4 h-4 mr-2" />
					Confirmar pedido
				</SubmitButton>
			</form>
		</Form>
	);
}
