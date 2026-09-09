"use client";

import { Loader2Icon } from "lucide-react";
import { UseFormReturn } from "react-hook-form";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";

/**
 * The reservation's own status, and the only control that saves it.
 *
 * The submit lives in this section's footer rather than loose under the page,
 * because it governs this section and the partner edit above it — a save button
 * floating between sections gives no clue what it covers.
 */
export default function ReservationStatusSection({
  form,
  submitting,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  submitting: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Estado de la reserva</CardTitle>
        <CardDescription>
          Cambiar el estado también guarda el acompañante que hayas editado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem className="grid gap-2">
              <FormLabel>Elegí una opción</FormLabel>
              <Select
                onValueChange={field.onChange}
                defaultValue={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Elegí una opción" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="verification_payment">
                    Verificación de Pago
                  </SelectItem>
                  <SelectItem value="accepted">Aceptada</SelectItem>
                  <SelectItem value="rejected">Rechazada</SelectItem>
                  <SelectItem value="cancelled" disabled>
                    Cancelada
                  </SelectItem>
                  <SelectItem value="released" disabled>
                    Liberada
                  </SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
      <CardFooter className="justify-end border-t pt-4">
        <Button disabled={submitting} type="submit">
          {submitting ? (
            <>
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Guardando
            </>
          ) : (
            <span>Guardar cambios</span>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
