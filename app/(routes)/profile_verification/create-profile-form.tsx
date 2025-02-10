"use client";

import { Button } from "@/app/components/ui/button";
import { Form } from "@/app/components/ui/form";
import { createUserProfile } from "@/app/lib/users/actions";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

export default function CreateProfileForm() {
  const { user } = useUser();
  const form = useForm();
  const router = useRouter();

  const action = async () => {
    const res = await createUserProfile({
      clerkId: user!.id,
      firstName: user!.firstName,
      lastName: user!.lastName,
      email: user!.emailAddresses[0].emailAddress,
      imageUrl: user!.imageUrl,
    });

    if (res.success) {
      router.push("/my_profile?completeProfile=true");
    } else {
      toast.error(
        <div>
          {res.message}{" "}
          <span>
            Puedes contactarte con soporte al correo
            soporte@productoraglitter.com
          </span>
        </div>,
      );
    }
  };

  return (
    <Form {...form}>
      <form className="w-full" onSubmit={form.handleSubmit(action)}>
        <Button
          disabled={
            form.formState.isSubmitting ||
            form.formState.isSubmitSuccessful ||
            !user
          }
          className="w-full"
          type="submit"
        >
          {form.formState.isSubmitting || form.formState.isSubmitSuccessful
            ? "Creando perfil..."
            : "Continuar con mi perfil"}
        </Button>
      </form>
    </Form>
  );
}
