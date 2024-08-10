"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { addUserToFestival } from "@/app/api/user_requests/actions";
import { ProfileType, UserCategory } from "@/app/api/users/definitions";
import { FestivalBase } from "@/app/data/festivals/definitions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

const FormSchema = z.object({
  consent: z.boolean().refine((val) => val === true, {
    message:
      "¡Si no leíste toda la información vuelve y léela que es importante!",
  }),
});

export default function TermsForm({
  profile,
  festival,
}: {
  profile: ProfileType;
  festival: FestivalBase;
}) {
  const router = useRouter();
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      consent: false,
    },
  });

  async function onSubmit(data: z.infer<typeof FormSchema>) {
    if (data.consent) {
      const res = await addUserToFestival(profile, festival);
      if (res.success) {
        toast.success(res.message);
        router.push(
          `/profiles/${profile.id}/festivals/${festival.id}/reservations/new`,
        );
      } else {
        toast.error(res.message);
      }
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="consent"
          render={({ field }) => (
            <FormItem className="rounded-md border p-4">
              <div className="flex flex-row items-start space-x-3 space-y-0">
                <FormControl>
                  <Checkbox
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <div className="space-y-1 leading-none">
                  <FormLabel>
                    Acepto lo términos y condiciones para participar en el
                    festival.
                  </FormLabel>
                  <FormDescription>
                    Si llegaste hasta aquí y estas de acuerdo con todas las
                    normas anteriores, acepta los términos y condiciones y dale
                    clic al botón.
                  </FormDescription>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button
            disabled={form.formState.isSubmitting}
            className="w-full md:max-w-60"
            type="submit"
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Cargando
              </>
            ) : (
              <span>¡Quiero reservar!</span>
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
