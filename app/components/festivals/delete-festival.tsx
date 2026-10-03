"use client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { useState } from "react";
import { deleteFestival } from "@/app/lib/festivals/actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export default function DeleteFestival({
  festivalId,
  festivalName,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  festivalId: number;
  festivalName?: string;
  /** The trigger. Omit it and pass `open` to open the dialog from a menu. */
  children?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);
    const result = await deleteFestival(festivalId);
    setIsDeleting(false);

    if (result.success) {
      toast.success(result.message);
      router.push("/dashboard/festivals");
    } else {
      toast.error(result.message);
    }
    setOpen(false);
  };

  return (
    <>
      {children ? (
        <div onClick={() => setOpen(true)} className="w-full">
          {children}
        </div>
      ) : null}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {festivalName ? `¿Eliminar ${festivalName}?` : "¿Eliminar festival?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Si el festival ya tuvo
              actividad (cambios de estado o movimientos de créditos), se
              archivará en lugar de eliminarse para conservar su historial.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {isDeleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
