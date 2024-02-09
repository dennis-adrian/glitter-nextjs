import { Button } from "@/app/components/ui/button";
import { Loader2Icon } from "lucide-react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";

export function SubmitButton() {
  const { pending, data } = useFormStatus();

  // if (data?.success) {
  //   toast.success(data.message);
  // }

  return (
    <Button disabled={pending} type="submit">
      {pending && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
      Submit
    </Button>
  );
}
