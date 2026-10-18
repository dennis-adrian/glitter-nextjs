import PhoneInput from "@/app/components/form/fields/phone";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRightIcon } from "lucide-react";
import { useForm } from "react-hook-form";

import { visitorDetailsSchema } from "@/app/lib/visitors/visitor-details-schema";

const FormSchema = visitorDetailsSchema.pick({ phoneNumber: true });

type PhoneFormProps = {
  onSubmit: (phoneNumber: string) => void;
};

export default function PhoneForm(props: PhoneFormProps) {
  const form = useForm({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      phoneNumber: "",
    },
  });

  const action: () => void = form.handleSubmit(async (data) => {
    props.onSubmit(data.phoneNumber);
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={action}>
        <PhoneInput bottomBorderOnly name="phoneNumber" />
        <SubmitButton
          disabled={form.formState.isSubmitting}
          loading={form.formState.isSubmitting}
        >
          <span>Continuar</span>
          <ArrowRightIcon className="ml-2 w-4 h-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}
