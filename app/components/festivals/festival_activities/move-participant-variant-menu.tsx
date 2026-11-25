"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeftIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { moveActivityParticipant } from "@/app/lib/festival_activites/admin-actions";
import { toastActionError } from "@/app/lib/errors/action-error";
import type { FestivalActivityDetail } from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";

export type MoveTargetVariant = {
  id: number;
  label: string;
  activeCount: number;
  participationLimit: number | null;
  category: FestivalActivityDetail["category"];
};

type MoveParticipantVariantMenuProps = {
  participationId: number;
  participantName: string;
  participantCategory: string | null;
  currentDetailId: number;
  variants: MoveTargetVariant[];
};

function unavailableReason(
  variant: MoveTargetVariant,
  participantCategory: string | null,
): string | null {
  if (variant.category && variant.category !== participantCategory) {
    return `Solo ${getCategoryLabel(variant.category)}`;
  }
  if (
    variant.participationLimit !== null &&
    variant.activeCount >= variant.participationLimit
  ) {
    return "Sin cupos";
  }
  return null;
}

export default function MoveParticipantVariantMenu({
  participationId,
  participantName,
  participantCategory,
  currentDetailId,
  variants,
}: MoveParticipantVariantMenuProps) {
  const router = useRouter();
  const [isMoving, setIsMoving] = useState(false);
  const movingRef = useRef(false);

  const targets = variants.filter((v) => v.id !== currentDetailId);
  if (targets.length === 0) return null;

  const move = async (
    targetDetailId: number,
    targetLabel: string,
    undoDetailId?: number,
  ) => {
    if (movingRef.current) return;
    movingRef.current = true;
    setIsMoving(true);
    try {
      const result = await moveActivityParticipant(
        participationId,
        targetDetailId,
      );
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      router.refresh();
      if (undoDetailId === undefined) {
        toast.success(result.message);
        return;
      }
      const sourceLabel =
        variants.find((v) => v.id === undoDetailId)?.label ?? "la variante";
      toast.success(`${participantName} ahora está en ${targetLabel}`, {
        action: {
          label: "Deshacer",
          onClick: () => void move(undoDetailId, sourceLabel),
        },
      });
    } catch (error) {
      toastActionError(
        error,
        "No se pudo mover al participante. Intentá nuevamente.",
      );
    } finally {
      movingRef.current = false;
      setIsMoving(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          disabled={isMoving}
          aria-label={`Mover a ${participantName} a otra variante`}
        >
          {isMoving ? (
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <ArrowRightLeftIcon className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="ml-1">Mover</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Mover a otra variante
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {targets.map((variant) => {
          const reason = unavailableReason(variant, participantCategory);
          const capacity =
            variant.participationLimit !== null
              ? `${variant.activeCount}/${variant.participationLimit}`
              : `${variant.activeCount}`;
          return (
            <DropdownMenuItem
              key={variant.id}
              disabled={reason !== null}
              onSelect={() =>
                void move(variant.id, variant.label, currentDetailId)
              }
              className="flex items-start justify-between gap-3"
            >
              <span className="min-w-0 break-words">{variant.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {reason ?? capacity}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
