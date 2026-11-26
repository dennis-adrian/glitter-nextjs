"use client";

import { useEffect, useRef, useState } from "react";
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
import { cn } from "@/app/lib/utils";

export type MoveTargetVariant = {
  id: number;
  label: string;
  activeCount: number;
  /** Unexpired waitlist invitations holding a seat in this variant. */
  reservedCount: number;
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

/** Mirrors the server's checks in moveActivityParticipant. */
function unavailableReason(
  variant: MoveTargetVariant,
  participantCategory: string | null,
): string | null {
  if (variant.category && variant.category !== participantCategory) {
    return `Solo ${getCategoryLabel(variant.category)}`;
  }
  if (
    variant.participationLimit !== null &&
    variant.activeCount + variant.reservedCount >= variant.participationLimit
  ) {
    return variant.reservedCount > 0 ? "Sin cupos (invitaciones)" : "Sin cupos";
  }
  return null;
}

function capacityLabel(variant: MoveTargetVariant): string {
  const base =
    variant.participationLimit !== null
      ? `${variant.activeCount}/${variant.participationLimit}`
      : `${variant.activeCount}`;
  if (variant.reservedCount === 0) return base;
  return `${base} · ${variant.reservedCount} invitado${variant.reservedCount !== 1 ? "s" : ""}`;
}

/**
 * The row a move just placed, so its Mover trigger can take focus once it
 * renders in the destination table: the trigger that had focus unmounts with
 * the row it left, which would drop keyboard users back to the page start.
 */
let pendingFocus: { participationId: number; detailId: number } | null = null;

function requestFocusAfterMove(participationId: number, detailId: number) {
  pendingFocus = { participationId, detailId };
}

/** True once, for the row the last move placed in `detailId`. */
function claimFocusAfterMove(participationId: number, detailId: number) {
  if (
    pendingFocus?.participationId !== participationId ||
    pendingFocus.detailId !== detailId
  ) {
    return false;
  }
  pendingFocus = null;
  return true;
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
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const trigger = triggerRef.current;
    if (
      !trigger ||
      // The table and the phone cards both render the row; one is hidden.
      trigger.getClientRects().length === 0 ||
      !claimFocusAfterMove(participationId, currentDetailId)
    ) {
      return;
    }
    // Only reclaim focus that was lost, never take it from where the admin
    // has since moved it.
    if (!document.activeElement || document.activeElement === document.body) {
      trigger.focus();
    }
  });

  const targets = variants.filter((v) => v.id !== currentDetailId);
  if (targets.length === 0) return null;

  const labelOf = (detailId: number) =>
    variants.find((v) => v.id === detailId)?.label ?? "la variante";

  /** `undoFrom` is set when undoing: where the move put the participant. */
  const move = async (targetDetailId: number, undoFrom?: number) => {
    const isUndo = undoFrom !== undefined;
    if (movingRef.current) return;
    movingRef.current = true;
    setIsMoving(true);
    try {
      const result = await moveActivityParticipant(
        participationId,
        targetDetailId,
        {
          // Refused if someone moved the participant meanwhile. An undo
          // expects them where the move put them.
          expectedSourceDetailId: undoFrom ?? currentDetailId,
          undo: isUndo,
        },
      );
      if (result.success) {
        requestFocusAfterMove(participationId, targetDetailId);
      }
      // Refresh on failure too: a refusal usually means the counts on screen
      // are stale (someone else filled the variant meanwhile).
      router.refresh();
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      const moved = `${participantName} ahora está en ${labelOf(targetDetailId)}`;
      if (isUndo) {
        toast.success(moved);
      } else if (result.invitedName) {
        // The freed slot already went to the waitlist, so there is nothing
        // left to undo into.
        toast.success(moved, {
          description: `Se invitó a ${result.invitedName} de la lista de espera al cupo liberado.`,
        });
      } else {
        toast.success(moved, {
          action: {
            label: "Deshacer",
            onClick: () => void move(currentDetailId, targetDetailId),
          },
        });
      }
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
        {/* Not `disabled` while moving: a disabled trigger cannot take back
            focus when the menu closes. movingRef blocks a second move. */}
        <Button
          ref={triggerRef}
          variant="ghost"
          size="sm"
          className="h-10 px-3 text-xs md:h-7 md:px-2"
          aria-busy={isMoving}
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
        className="w-72 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Mover a otra variante
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {targets.map((variant) => {
          const reason = unavailableReason(variant, participantCategory);
          return (
            <DropdownMenuItem
              key={variant.id}
              disabled={reason !== null || isMoving}
              onSelect={() => void move(variant.id)}
              // Keep disabled rows legible: the reason is the point of
              // showing them.
              className="flex items-start justify-between gap-3 data-[disabled]:opacity-100"
            >
              <span
                className={cn(
                  "min-w-0 break-words",
                  reason && "text-muted-foreground",
                )}
              >
                {variant.label}
              </span>
              <span
                className={cn(
                  "shrink-0 text-xs",
                  reason
                    ? "font-medium text-destructive dark:text-red-400"
                    : "text-muted-foreground",
                )}
              >
                {reason ?? capacityLabel(variant)}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
