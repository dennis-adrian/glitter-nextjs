"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FestivalBase } from "@/app/data/festivals/definitions";
import { Button } from "@/app/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { createTickets } from "@/app/data/tickets/actions";
import { VisitorWithTickets, fetchVisitor } from "@/app/data/visitors/actions";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { getAttendanceOptions } from "./helpers";

const FormSchema = z.object({
  attendance: z.enum(["day_one", "day_two", "both"]),
});
export type AttendanceType = z.infer<typeof FormSchema>["attendance"];

export default function TicketCreationForm({
  festival,
  visitor,
  onSuccess,
}: {
  festival: FestivalBase;
  visitor: VisitorWithTickets;
  onSuccess: () => void;
}) {
  const attendanceOptions = getAttendanceOptions(visitor, festival);
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      attendance: attendanceOptions[0].value,
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    const res = await createTickets({
      attendance: data.attendance,
      visitorId: visitor.id,
      festivalId: festival.id,
      festivalStartDate: festival.startDate,
      festivalEndDate: festival.endDate,
    });

    if (res.success) {
      const updatedVisitor = await fetchVisitor(visitor.id);
      onSuccess();
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/send`, {
        body: JSON.stringify({
          visitor: updatedVisitor,
          festival,
        }),
        method: "POST",
      });
      toast.success(
        "¡Gracias por confirmar tu asistencia! Te hemos enviado un correo con los detalles.",
      );
    } else {
      toast.error(
        "Ocurrió un error al confirmar tu asistencia. Intenta de nuevo.",
      );
    }
  }

  if (form.formState.isSubmitting) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader2Icon className="h-20 w-20 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid items-start gap-4"
        >
          <FormField
            control={form.control}
            name="attendance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>¿Qué día asistirás?</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elige una opción" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {attendanceOptions.map((option) => (
                      <SelectItem
                        className="capitalize"
                        key={option.value}
                        value={option.value}
                      >
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )}
          />
          <Button disabled={form.formState.isSubmitting} type="submit">
            Confirmar asistencia
          </Button>
        </form>
      </Form>
    </>
  );
}
