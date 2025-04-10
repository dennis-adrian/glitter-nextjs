import TextInput from "@/app/components/form/fields/text";
import SubmitButton from "@/app/components/simple-submit-button";
import { Form } from "@/app/components/ui/form";
import { PlusIcon } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

const FormSchema = z.object({
  name: z
    .string({
      required_error: "El nombre es requerido",
    })
    .min(3, { message: "El nombre debe tener al menos 3 caracteres" }),
  last_name: z
    .string({
      required_error: "El apellido es requerido",
    })
    .min(3, { message: "El apellido debe tener al menos 3 caracteres" }),
  identification_number: z
    .string({
      required_error: "El número de carnet es requerido",
    })
    .min(5, {
      message: "El número de carnet debe tener al menos 5 caracteres",
    }),
});

export default function CollaboratorForm() {
  const form = useForm<z.infer<typeof FormSchema>>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      last_name: "",
      identification_number: "",
    },
  });

  const action: () => void = form.handleSubmit((data) => {});

  return (
    <Form {...form}>
      <form className="grid gap-4 mb-6" onSubmit={action}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TextInput
            label="Nombre(s)"
            name="name"
            placeholder="Ej. Juan Carlos"
            required
            formControl={form.control}
          />
          <TextInput
            label="Apellido(s)"
            name="last_name"
            placeholder="Ej. Perez"
            required
            formControl={form.control}
          />
          <TextInput
            label="Nro de Carnet"
            name="identification_number"
            placeholder="Ej. 12345678"
            required
            formControl={form.control}
          />
        </div>
        <SubmitButton
          className="w-full bg-rose-500 hover:bg-rose-600 text-white"
          disabled={false}
          loading={false}
          loadingLabel="Agregando colaborador..."
        >
          <PlusIcon className="h-4 w-4 mr-2" /> Agregar Colaborador
        </SubmitButton>
      </form>
    </Form>
  );
}
