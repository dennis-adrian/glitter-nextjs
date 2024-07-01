"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2Icon } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { FestivalWithDates } from "@/app/data/festivals/definitions";
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
  festival: FestivalWithDates;
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
      festivalStartDate: festival.festivalDates[0].startDate,
      festivalEndDate: festival.festivalDates[1]?.startDate,
    });
    const toastId = toast("loading");
    toast.loading("Enviando confirmación...", {
      id: toastId,
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
      toast.dismiss(toastId);
      toast.success("¡Gracias por confirmar tu asistencia!", {
        description: "Te enviamos un correo con los detalles de tu registro.",
        duration: 10000,
        closeButton: true,
      });
    } else {
      toast.error(
        "Ocurrió un error al confirmar tu asistencia. Intenta de nuevo.",
        {
          duration: 10000,
          closeButton: true,
        },
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
                      <SelectItem key={option.value} value={option.value}>
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
