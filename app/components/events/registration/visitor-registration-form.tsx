"use client";

import { captureClientEvent } from "@/app/lib/posthog-capture";
import { POSTHOG_EVENTS } from "@/app/lib/posthog-events";
import DateInput from "@/app/components/form/fields/date";
import PhoneInput from "@/app/components/form/fields/phone";
import SelectInput from "@/app/components/form/fields/select";
import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { genderOptions } from "@/app/lib/utils";
import { registerVisitor } from "@/app/lib/visitors/registration-actions";
import { visitorDetailsSchema } from "@/app/lib/visitors/visitor-details-schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function VisitorRegistrationForm({
  festivalId,
  email,
}: {
  festivalId: number;
  /** Shown read-only: the server already holds it from the email step. */
  email: string;
}) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(visitorDetailsSchema),
    defaultValues: {
      birthdate: "",
      firstName: "",
      gender: "other" as const,
      lastName: "",
      phoneNumber: "",
    },
  });

  const action = form.handleSubmit(async (data) => {
    const res = await registerVisitor({
      festivalId,
      mode: "online",
      details: data,
    });

    if (res.success) {
      captureClientEvent(POSTHOG_EVENTS.VISITOR_REGISTRATION_COMPLETED, {
        gender: data.gender,
      });
      router.push("?step=3");
      return;
    }

    toast.error(res.message);
    // An error keeps the submit button usable for another try.
    form.setError("root", { message: res.message });
    if (res.restart) router.push("?step=1");
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="grid items-start gap-4 md:gap-6">
        <div className="grid gap-2">
          <Label htmlFor="visitor-email">Email</Label>
          <Input
            id="visitor-email"
            bottomBorderOnly
            type="email"
            value={email}
            disabled
            readOnly
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextInput
            bottomBorderOnly
            name="firstName"
            label="Nombre"
            type="text"
            autoComplete="given-name"
          />
          <TextInput
            bottomBorderOnly
            name="lastName"
            label="Apellido"
            type="text"
            autoComplete="family-name"
          />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <DateInput
            bottomBorderOnly
            formControl={form.control}
            name="birthdate"
            label="Fecha de nacimiento"
            autoComplete="bday"
          />
          <PhoneInput bottomBorderOnly name="phoneNumber" label="Teléfono" />
          <SelectInput
            variant="quiet"
            formControl={form.control}
            label="Género"
            name="gender"
            options={genderOptions}
            side="top"
          />
        </div>
        <SubmitButton
          className="my-2"
          disabled={
            form.formState.isSubmitting || form.formState.isSubmitSuccessful
          }
          loading={form.formState.isSubmitting}
        >
          Siguiente <ArrowRightCircleIcon className="ml-2 h-4 w-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}
