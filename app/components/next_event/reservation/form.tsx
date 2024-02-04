"use client";

import { Stand } from "@/app/api/stands/actions";
import { Button } from "@/app/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { useForm } from "react-hook-form";

export default function ReservationForm({ stand }: { stand: Stand }) {
  const form = useForm();
  return (
    <Form {...form}>
      <form className="grid items-start gap-4">
        <FormField
          control={form.control}
          name="artist"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Busca a tu compañero</FormLabel>
              <FormControl>
                <Input
                  type="text"
                  placeholder="Ingresa el nombre de tu compañero"
                  {...field}
                />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit">Confirmar reserva</Button>
      </form>
    </Form>
  );
}
