import { Form } from "@/app/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import PhoneInput from "@/app/components/form/fields/phone";
import { ArrowRightIcon } from "lucide-react";
import SubmitButton from "@/app/components/simple-submit-button";
import { validatePhoneNumber } from "@/app/components/festivals/registration/forms/helpers";

const FormSchema = z
  .object({
    phoneNumber: z
      .string()
      .min(8, { message: "El número de teléfono no es valido" })
      .max(8, { message: "El número de teléfono no es valido" }),
  })
  .refine(
    (data) => {
      return validatePhoneNumber(data.phoneNumber);
    },
    {
      message: "El número de teléfono no es valido",
      path: ["phoneNumber"],
    },
  );

type PhoneFormProps = {
  onSubmit: (phoneNumber: string) => void;
};

export default function PhoneForm(props: PhoneFormProps) {
  const form = useForm<z.infer<typeof FormSchema>>({
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
        <PhoneInput
          bottomBorderOnly
          formControl={form.control}
          name="phoneNumber"
        />
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
