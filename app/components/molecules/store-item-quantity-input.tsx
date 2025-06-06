"use client";

import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import SubmitButton from "../simple-submit-button";
import { BaseProduct } from "@/app/lib/products/definitions";
import { Button } from "../ui/button";
import { MinusIcon, PlusIcon } from "lucide-react";
import { Input } from "../ui/input";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createOrder } from "@/app/lib/orders/actions";
import { NewOrderItem } from "@/app/lib/orders/definitions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const FormSchema = z.object({
  itemQuantity: z.coerce
    .number()
    .min(1, { message: "La cantidad mínima es 1" })
    .max(5, { message: "La cantidad máxima es 5" }),
});

type StoreItemQuantityInputProps = {
  product: BaseProduct;
  userId?: number;
};

export default function StoreItemQuantityInput({
  product,
  userId,
}: StoreItemQuantityInputProps) {
  const router = useRouter();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      itemQuantity: 1,
    },
  });

  const handleAddItem = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    form.setValue("itemQuantity", form.getValues("itemQuantity") + 1);
  };

  const handleRemoveItem = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const value = form.getValues("itemQuantity");
    if (value == 0) return 0;
    form.setValue("itemQuantity", value - 1);
  };

  const action: () => void = form.handleSubmit(async (data) => {
    if (!userId) {
      toast.error("Usuario no válido");
      return;
    }

    const orderItemsToInsert: NewOrderItem[] = [
      {
        productId: product.id,
        quantity: data.itemQuantity,
        priceAtPurchase: product.price,
        // this is a temporary order id, it will be replaced with the actual order id after the order is created
        orderId: 0,
      },
    ];
    const totalAmount = product.price * data.itemQuantity;

    const { details, message, success } = await createOrder(
      orderItemsToInsert,
      userId,
      totalAmount,
    );

    if (success && details?.orderId) {
      toast.success(message);
      form.reset();
      router.push(`/profiles/${userId}/orders/${details.orderId}`);
    } else {
      form.setError("root", { message });
      toast.error(message);
    }
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4 mt-4" onSubmit={action}>
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
                  <Input className="w-10 md:w-16" type="number" {...field} />
                </FormControl>
                <Button variant="outline" size="icon" onClick={handleAddItem}>
                  <PlusIcon className="w-4 h-4" />
                </Button>
              </div>
              <FormMessage />
              <span className="text-sm">
                Subtotal Bs{product.price * field.value}
              </span>
            </FormItem>
          )}
        />
        <SubmitButton
          className={`w-full ${product.isPreOrder ? "bg-amber-600 hover:bg-amber-700" : "bg-purple-600 hover:bg-purple-700"}`}
          disabled={
            !form.formState.isValid || form.formState.isSubmitSuccessful
          }
          loading={form.formState.isSubmitting}
          label={`${product.isPreOrder ? "Quiero reservar" : "Agregar al carrito"}`}
        />
      </form>
    </Form>
  );
}
