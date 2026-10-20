"use client";

import {
  CopyIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PencilIcon,
  PlayIcon,
} from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { setDiscountCodeActive } from "@/app/lib/discount_codes/actions";
import type { DiscountCodeBase } from "@/app/lib/discount_codes/definitions";

type DiscountCodeActionsMenuProps = {
  discountCode: Pick<DiscountCodeBase, "id" | "code" | "isActive">;
  triggerClassName?: string;
};

/** Everything an admin can do to one discount code, behind one button. */
export default function DiscountCodeActionsMenu({
  discountCode,
  triggerClassName,
}: DiscountCodeActionsMenuProps) {
  const [isPending, startTransition] = useTransition();
  const displayCode = discountCode.code.toUpperCase();

  function copyCode() {
    navigator.clipboard.writeText(displayCode).then(
      () => toast.success(`"${displayCode}" copiado al portapapeles`),
      () => toast.error("No se pudo copiar el código."),
    );
  }

  function toggleActive() {
    startTransition(async () => {
      const result = await setDiscountCodeActive({
        id: discountCode.id,
        isActive: !discountCode.isActive,
      });
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    });
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={triggerClassName}
          disabled={isPending}
          aria-label={`Acciones de ${displayCode}`}
        >
          <MoreHorizontalIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuItem asChild>
          <Link href={`/dashboard/discount_codes/${discountCode.id}/edit`}>
            <PencilIcon className="mr-2 h-4 w-4" />
            Editar
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyCode}>
          <CopyIcon className="mr-2 h-4 w-4" />
          Copiar código
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={toggleActive} disabled={isPending}>
          {discountCode.isActive ? (
            <>
              <PauseIcon className="mr-2 h-4 w-4" />
              Desactivar
            </>
          ) : (
            <>
              <PlayIcon className="mr-2 h-4 w-4" />
              Activar
            </>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
