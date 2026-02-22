"use client";

import { BaseProfile } from "@/app/api/users/definitions";
import { createOrder } from "@/app/lib/orders/actions";
import { getProductPriceAtPurchase } from "@/app/lib/orders/utils";
import { BaseProduct } from "@/app/lib/products/definitions";
import { zodResolver } from "@hookform/resolvers/zod";
import { MinusIcon, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "../ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "../ui/form";
import { Input } from "../ui/input";
import SubmitProductOrderButton from "@/app/components/molecules/submit-product-order-button";

const FormSchema = z.object({
	itemQuantity: z.coerce
		.number()
		.min(1, {
			error: "La cantidad mínima es 1",
		})
		.max(5, {
			error: "La cantidad máxima es 5",
		}),
});

type StoreItemQuantityInputProps = {
	product: BaseProduct;
	user?: BaseProfile;
};

export default function StoreItemQuantityInput({
	product,
	user,
}: StoreItemQuantityInputProps) {
	const router = useRouter();
	const form = useForm<
		z.input<typeof FormSchema>,
		unknown,
		z.output<typeof FormSchema>
	>({
		resolver: zodResolver(FormSchema),
		defaultValues: {
			itemQuantity: 1,
		},
	});

	const handleAddItem = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		const currentValue = form.getValues("itemQuantity") as number;
		form.setValue("itemQuantity", currentValue + 1);
	};

	const handleRemoveItem = (e: React.MouseEvent<HTMLButtonElement>) => {
		e.preventDefault();
		const value = form.getValues("itemQuantity") as number;
		if (value <= 1) return;
		form.setValue("itemQuantity", value - 1);
	};

	const action: () => void = form.handleSubmit(async (data) => {
		if (!user) {
			toast.error("Usuario no válido");
			return;
		}

		const orderItemsIdsQuantityMap: Map<number, number> = new Map([
			[product.id, data.itemQuantity],
		]);

		const { details, message, success } = await createOrder(
			orderItemsIdsQuantityMap,
			user.id,
			user.email,
			user.displayName || "",
		);

		if (success && details?.orderId) {
			toast.success(message);
			router.push(`/profiles/${user.id}/orders/${details.orderId}`);
		} else {
			form.setError("root", { message });
			toast.error(message);
		}

		form.reset();
	});

	return (
		<Form {...form}>
			<form className="flex flex-col gap-4 mt-4" onSubmit={action}>
				{(product.stock ?? 0) > 0 && (
					<FormField
						control={form.control}
						name="itemQuantity"
						render={({ field }) => (
							<FormItem className="flex flex-col items-end gap-1 self-end">
								<FormLabel className="self-start">Cantidad</FormLabel>
								<div className="flex gap-1">
									<Button
										variant="outline"
										size="icon"
										onClick={handleRemoveItem}
									>
										<MinusIcon className="w-4 h-4" />
									</Button>
									<FormControl>
										<Input
											className="w-16 md:w-16"
											type="number"
											value={field.value as string}
											onChange={(e) => field.onChange(Number(e.target.value))}
											onBlur={field.onBlur}
										/>
									</FormControl>
									<Button variant="outline" size="icon" onClick={handleAddItem}>
										<PlusIcon className="w-4 h-4" />
									</Button>
								</div>
								<FormMessage />
								<span className="text-sm">
									Subtotal Bs
									{getProductPriceAtPurchase(product) * (field.value as number)}
								</span>
							</FormItem>
						)}
					/>
				)}
				<SubmitProductOrderButton
					disabled={!form.formState.isValid || form.formState.isSubmitting}
					loading={form.formState.isSubmitting}
					product={product}
				/>
			</form>
		</Form>
	);
}
