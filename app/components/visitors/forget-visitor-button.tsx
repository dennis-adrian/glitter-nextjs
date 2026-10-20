"use client";

import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/app/components/ui/button";
import { forgetVisitor } from "@/app/lib/visitors/registration-actions";

/** Closes the visitor's tickets on this device, e.g. a borrowed phone. */
export default function ForgetVisitorButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await forgetVisitor();
          router.refresh();
        })
      }
    >
      <LogOutIcon className="mr-2 h-4 w-4" aria-hidden />
      Salir
    </Button>
  );
}
