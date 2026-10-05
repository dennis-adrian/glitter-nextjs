"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
} from "@/app/components/ui/drawer-dialog";
import { Form } from "@/app/components/ui/form";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import { addUnsubscribe } from "@/app/lib/emails/admin-actions";
import { AddUnsubscribeSchema } from "@/app/lib/emails/admin-definitions";
import {
  EMAIL_TOPIC_SHORT_LABELS,
  EMAIL_TOPICS,
} from "@/app/lib/emails/topics";

const TOPIC_OPTIONS = [
  // Stopping everything first: it is what someone writing to support asks.
  { value: "all", label: EMAIL_TOPIC_SHORT_LABELS.all },
  ...EMAIL_TOPICS.filter((topic) => topic !== "all").map((topic) => ({
    value: topic,
    label: EMAIL_TOPIC_SHORT_LABELS[topic],
  })),
];

/**
 * For someone who asked to stop receiving our bulk mail some other way than
 * the link in the email: a reply, a message to support.
 */
export default function AddUnsubscribeDialog() {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const form = useForm({
    resolver: zodResolver(AddUnsubscribeSchema),
    defaultValues: { email: "", topic: "all" as const },
  });

  const action = form.handleSubmit(async (data) => {
    const result = await addUnsubscribe(data);
    if (!result.success) {
      form.setError("email", { message: result.message });
      return;
    }
    toast.success(result.message);
    form.reset();
    setOpen(false);
    router.refresh();
  });

  return (
    <>
      <Button
        type="button"
        className="w-full sm:w-auto"
        onClick={() => setOpen(true)}
      >
        <MailXIcon className="mr-2 h-4 w-4" aria-hidden />
        Dar de baja un correo
      </Button>
      <DrawerDialog isDesktop={isDesktop} open={open} onOpenChange={setOpen}>
        <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
          <DrawerDialogHeader isDesktop={isDesktop}>
            <DrawerDialogTitle isDesktop={isDesktop}>
              Dar de baja un correo
            </DrawerDialogTitle>
            <DrawerDialogDescription isDesktop={isDesktop}>
              Para quien pidió no recibir más correos por otro medio, como un
              mensaje a soporte. Sus entradas, reservas y pedidos le siguen
              llegando.
            </DrawerDialogDescription>
          </DrawerDialogHeader>
          <div className={isDesktop ? "" : "px-4"}>
            <Form {...form}>
              <form onSubmit={action} className="grid gap-4">
                <TextInput
                  name="email"
                  label="Correo"
                  type="email"
                  autoComplete="off"
                  placeholder="ejemplo@mail.com"
                />
                <SelectInput
                  formControl={form.control}
                  name="topic"
                  label="Qué deja de recibir"
                  options={TOPIC_OPTIONS}
                />
                <SubmitButton
                  disabled={form.formState.isSubmitting}
                  loading={form.formState.isSubmitting}
                  label="Dar de baja"
                />
              </form>
            </Form>
          </div>
          {isDesktop ? null : (
            <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
              <DrawerDialogClose isDesktop={isDesktop}>
                <Button variant="outline" className="w-full">
                  Cancelar
                </Button>
              </DrawerDialogClose>
            </DrawerDialogFooter>
          )}
        </DrawerDialogContent>
      </DrawerDialog>
    </>
  );
}
