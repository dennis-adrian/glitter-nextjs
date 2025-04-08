import SubmitButton from "@/app/components/simple-submit-button";
import { Form, FormField } from "@/app/components/ui/form";
import { CloudUploadIcon } from "lucide-react";
import { useForm } from "react-hook-form";

type UploadFormProps = {
  onSubmit: (data: any) => void;
};

export default function UploadForm({ onSubmit }: UploadFormProps) {
  const form = useForm();

  return (
    <Form {...form}>
      <form>
        <SubmitButton
          loading={form.formState.isSubmitting}
          disabled={form.formState.isSubmitting}
        >
          Upload
          <CloudUploadIcon className="ml-2 w-4 h-4" />
        </SubmitButton>
      </form>
    </Form>
  );
}
