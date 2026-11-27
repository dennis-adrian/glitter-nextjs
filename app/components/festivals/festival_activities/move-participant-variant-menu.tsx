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
import {
  moveActivityParticipant,
  retryWaitlistInvitation,
} from "@/app/lib/festival_activites/admin-actions";
import {
  isStaleDeploymentError,
  toastActionError,
  toastStaleDeployment,
} from "@/app/lib/errors/action-error";
import type { FestivalActivityDetail } from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import { cn } from "@/app/lib/utils";

export type MoveTargetVariant = {
  id: number;
  label: string;
  activeCount: number;
  /**
   * When each waitlist invitation holding a seat in this variant lapses (ms
   * since epoch). Counted when the menu opens, so a page left open stops
   * blocking a variant once its invitations expire.
   */
  reservationExpiries: number[];
  participationLimit: number | null;
  category: FestivalActivityDetail["category"];
};

type MoveParticipantVariantMenuProps = {
  activityId: number;
  participationId: number;
  participantName: string;
  participantCategory: string | null;
  currentDetailId: number;
  variants: MoveTargetVariant[];
};

/**
 * Mirrors the server's checks in moveActivityParticipant, which treats a
 * limit of 0 like no limit at all.
 */
function unavailableReason(
  variant: MoveTargetVariant,
  reservedCount: number,
  participantCategory: string | null,
): string | null {
  if (variant.category && variant.category !== participantCategory) {
    return `Solo ${getCategoryLabel(variant.category)}`;
  }
  if (
    variant.participationLimit &&
    variant.activeCount + reservedCount >= variant.participationLimit
  ) {
    return reservedCount > 0 ? "Sin cupos (invitaciones)" : "Sin cupos";
  }
  return null;
}

function capacityLabel(
  variant: MoveTargetVariant,
  reservedCount: number,
): string {
  const base = variant.participationLimit
    ? `${variant.activeCount}/${variant.participationLimit}`
    : `${variant.activeCount}`;
  if (reservedCount === 0) return base;
  return `${base} · ${reservedCount} invitado${reservedCount !== 1 ? "s" : ""}`;
}

/**
 * The row a move just placed, so its Mover trigger can take focus once it
 * renders in the destination table: the trigger that had focus unmounts with
 * the row it left, which would drop keyboard users back to the page start.
 */
let pendingFocus: { participationId: number; detailId: number } | null = null;

/**
 * Long enough for a slow refresh to land; after that the request is dropped,
 * e.g. when someone else moved the participant again meanwhile and no table
 * will ever list them where this move put them.
 */
const FOCUS_REQUEST_TTL_MS = 15_000;

function requestFocusAfterMove(participationId: number, detailId: number) {
  const request = { participationId, detailId };
  pendingFocus = request;
  setTimeout(() => {
    if (pendingFocus === request) pendingFocus = null;
  }, FOCUS_REQUEST_TTL_MS);
}

/** Whether the last move placed this row in `detailId`; claims nothing. */
function isFocusPendingFor(participationId: number, detailId: number) {
  return (
    pendingFocus?.participationId === participationId &&
    pendingFocus.detailId === detailId
  );
}

/** True once, for the row the last move placed in `detailId`. */
function claimFocusAfterMove(participationId: number, detailId: number) {
  if (!isFocusPendingFor(participationId, detailId)) return false;
  pendingFocus = null;
  return true;
}

/**
 * For the destination table, after its rows' menus had their chance: true
 * once when the last move placed one of `participationIds` in `detailId` but
 * no visible row claimed it (filtered, searched or paged out), so the table
 * can take focus instead. Effects run children first, so a visible row's
 * menu always claims before its table asks.
 */
export function takeUnclaimedFocusAfterMove(
  detailId: number,
  participationIds: number[],
) {
  if (
    pendingFocus?.detailId !== detailId ||
    !participationIds.includes(pendingFocus.participationId)
  ) {
    return false;
  }
  pendingFocus = null;
  return true;
}

export default function MoveParticipantVariantMenu({
  activityId,
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
  // Invitations are counted against the time the menu opened, not the time
  // the page rendered.
  const [openedAt, setOpenedAt] = useState(() => Date.now());

  useEffect(() => {
    const trigger = triggerRef.current;
    if (
      !trigger ||
      // Cheap check first: this runs after every render of every row, and
      // reading layout below is not free.
      !isFocusPendingFor(participationId, currentDetailId) ||
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

  /**
   * Only re-sends the invitation for the seat the move freed; the participant
   * stays where the move put them. Null when the tab runs a stale build: the
   * reload notice is up instead, since no retry or undo can work until then.
   */
  const retryInvitation = async (
    sourceDetailId: number,
  ): Promise<{ success: boolean; message: string } | null> => {
    try {
      const result = await retryWaitlistInvitation(activityId, sourceDetailId);
      router.refresh();
      return result;
    } catch (error) {
      if (isStaleDeploymentError(error)) {
        toastStaleDeployment();
        return null;
      }
      return {
        success: false,
        message: "No se pudo enviar la invitación. Intentá nuevamente.",
      };
    }
  };

  /**
   * `undoOf` is set when undoing: where the move put the participant, and
   * what the server returned for it.
   */
  const move = async (
    targetDetailId: number,
    undoOf?: { from: number; revision: string },
  ) => {
    const isUndo = undoOf !== undefined;
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
          expectedSourceDetailId: undoOf?.from ?? currentDetailId,
          undo: undoOf && { revision: undoOf.revision },
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
      } else if (result.revision !== undefined) {
        const undoOf = { from: targetDetailId, revision: result.revision };
        const sourceDetailId = currentDetailId;
        const toastId = `move-${participationId}-${result.revision}`;
        let retrying = false;
        const retry = async () => {
          if (retrying) return;
          retrying = true;
          // The same toast reports the attempt, pinned and with neither the
          // retry nor Deshacer: a sent invitation holds the freed seat, and
          // an undo meanwhile would leave a failed retry re-showing a move
          // that no longer stands.
          toast.success(moved, {
            id: toastId,
            duration: Infinity,
            dismissible: false,
            description: "Enviando invitación…",
            action: undefined,
          });
          const retried = await retryInvitation(sourceDetailId);
          retrying = false;
          if (!retried) {
            toast.dismiss(toastId);
          } else if (retried.success) {
            toast.dismiss(toastId);
            toast.success(retried.message);
          } else {
            // Nothing was invited, so the undo still stands.
            showMoved(retried.message);
          }
        };
        // With `invitationError`, the retry sits in the description, not as a
        // second toast button: two buttons beside the text squeeze it to
        // nothing on a phone. A failed retry re-shows the toast by id, with
        // the default timer and close back.
        const showMoved = (invitationError?: string) =>
          toast.success(moved, {
            id: toastId,
            duration: undefined,
            dismissible: true,
            description:
              invitationError !== undefined ? (
                <span className="flex flex-col items-start gap-1">
                  <span className="break-words">{invitationError}</span>
                  <button
                    type="button"
                    // As tall as Deshacer on a phone, so it is as easy to tap.
                    className="inline-flex min-h-10 items-center text-left font-medium underline underline-offset-2 break-words md:min-h-0"
                    onClick={() => void retry()}
                  >
                    Reintentar invitación
                  </button>
                </span>
              ) : undefined,
            action: {
              label: "Deshacer",
              onClick: () => void move(currentDetailId, undoOf),
            },
          });
        showMoved(
          result.invitationFailed
            ? "No se pudo enviar la invitación a la lista de espera."
            : undefined,
        );
      } else if (result.invitationFailed) {
        toast.success(moved, {
          description:
            "No se pudo enviar la invitación a la lista de espera. Invitá manualmente desde la lista de espera.",
        });
      } else {
        toast.success(moved);
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
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) setOpenedAt(Date.now());
      }}
    >
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
        // Every other variant is listed, so a long list scrolls inside the
        // space Radix measured rather than running off a phone screen.
        className="w-72 max-w-[calc(100vw-2rem)] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-x-hidden overflow-y-auto"
        onCloseAutoFocus={(event) => {
          // Radix returns focus to the trigger once the close animation ends;
          // skip that when the admin has already focused something else.
          const active = document.activeElement;
          if (
            active &&
            active !== document.body &&
            !(event.currentTarget as HTMLElement).contains(active)
          ) {
            event.preventDefault();
          }
        }}
      >
        <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
          Mover a otra variante
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {targets.map((variant) => {
          const reservedCount = variant.reservationExpiries.filter(
            (expiresAt) => expiresAt > openedAt,
          ).length;
          const reason = unavailableReason(
            variant,
            reservedCount,
            participantCategory,
          );
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
                {reason ?? capacityLabel(variant, reservedCount)}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
