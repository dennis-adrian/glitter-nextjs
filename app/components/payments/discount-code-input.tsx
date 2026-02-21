"use client";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { validateAndApplyDiscountCode } from "@/app/lib/discount_codes/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

type DiscountCodeInputProps = {
  invoiceId: number;
  festivalId: number;
};

export default function DiscountCodeInput({
  invoiceId,
  festivalId,
}: DiscountCodeInputProps) {
  const [code, setCode] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleApply() {
    if (!code.trim()) return;

    startTransition(async () => {
      const result = await validateAndApplyDiscountCode({
        code: code.trim(),
        invoiceId,
        festivalId,
      });

      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.message);
      }
    });
  }

  return (
    <div className="flex gap-2">
      <Input
        placeholder="Código de descuento"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        disabled={isPending}
        className="uppercase"
        onKeyDown={(e) => {
          if (e.key === "Enter") handleApply();
        }}
      />
      <Button
        type="button"
        variant="outline"
        onClick={handleApply}
        disabled={isPending || !code.trim()}
      >
        {isPending ? "Aplicando..." : "Aplicar"}
      </Button>
    </div>
  );
}
