"use client";

import { useState } from "react";

import { Loader2Icon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import { deleteFestivalActivityParticipantProof } from "@/app/lib/festival_activites/actions";
import { cn } from "@/app/lib/utils";

type RemoveProofImageButtonProps = {
  proofId: number;
  participationId: number;
  forProfileId: number;
  festivalId: number;
  label?: string;
  className?: string;
  /** Runs after a successful removal; defaults to refreshing the route. */
  onRemoved?: () => void;
};

/**
 * Confirm-and-remove control for an uploaded activity proof image. Removal is
 * only permitted server-side while the upload window is open and the proof has
 * not been approved, so a successful removal frees the participant to upload a
 * replacement.
 */
export default function RemoveProofImageButton({
  proofId,
  participationId,
  forProfileId,
  festivalId,
  label = "Quitar imagen",
  className,
  onRemoved,
}: RemoveProofImageButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleConfirm = async () => {
    setIsDeleting(true);
    const result = await deleteFestivalActivityParticipantProof(
      proofId,
      participationId,
      forProfileId,
      festivalId,
    );
    setIsDeleting(false);
    setOpen(false);
    if (result.success) {
      toast.success(result.message);
      if (onRemoved) {
        onRemoved();
      } else {
        router.refresh();
      }
    } else {
      toast.error(result.message);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!isDeleting) setOpen(next);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isDeleting}
          className={cn(
            "bg-red-50 hover:bg-red-100 text-red-800 border-red-300",
            className,
          )}
        >
          {isDeleting ? (
            <>
              <Loader2Icon className="w-4 h-4 mr-2 animate-spin" />
              <span>Eliminando...</span>
            </>
          ) : (
            <>
              <Trash2Icon className="w-4 h-4 mr-2" />
              <span>{label}</span>
            </>
          )}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción no se puede deshacer. La imagen será eliminada
            permanentemente y podrás subir una nueva.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault();
              void handleConfirm();
            }}
            disabled={isDeleting}
            className="bg-red-600 hover:bg-red-700"
          >
            {isDeleting ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
