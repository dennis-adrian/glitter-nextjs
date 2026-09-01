"use client";

import { z } from "zod";

import {
  reviewBecomeArtistRequest,
  reviewFestivalParticipationRequest,
} from "@/app/api/user_requests/actions";
import { UserRequest } from "@/app/api/user_requests/definitions";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/app/components/ui/button";

const FormSchema = z.object({
  status: z.enum(["accepted", "rejected"], {
    error: (issue) =>
      issue.input === undefined
        ? "Debés elegir aprobar o rechazar la solicitud."
        : undefined,
  }),
});

type FormValues = z.infer<typeof FormSchema>;

function defaultReviewStatus(
  status: UserRequest["status"],
): FormValues["status"] | undefined {
  if (status === "rejected") return "rejected";
  if (status === "accepted") return "accepted";
  return undefined;
}

export default function UserRequestForm({ request }: { request: UserRequest }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      status: defaultReviewStatus(request.status),
    },
  });

  async function onSubmit(data: FormValues) {
    const result =
      request.type === "become_artist"
        ? await reviewBecomeArtistRequest({
            requestId: request.id,
            status: data.status,
          })
        : await reviewFestivalParticipationRequest({
            requestId: request.id,
            status: data.status,
          });
    if (result.success) {
      toast("La solicitud ha sido actualizada.");
    } else {
      toast.error(result.message);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="grid items-start gap-4"
      >
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado de la solicitud</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Elige una opción" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="accepted">Aprobado</SelectItem>
                  <SelectItem value="rejected">Rechazado</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Guardar cambios</Button>
      </form>
    </Form>
  );
}
