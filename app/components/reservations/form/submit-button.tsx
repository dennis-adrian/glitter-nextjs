import { useFormStatus } from "react-dom";

import { Loader2Icon } from "lucide-react";

import { Button } from "@/app/components/ui/button";

export function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending} type="submit">
      {pending && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
      Submit
    </Button>
  );
}
