"use client";

import { Archive, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import type { BaseProfile } from "@/app/api/users/definitions";
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
import { archivePost, deletePost } from "@/app/lib/posts/actions";
import type { PostWithRelations } from "@/app/lib/posts/definitions";
import { canArchivePost, canDeletePost } from "@/app/lib/posts/helpers";

type Props = {
  post: PostWithRelations;
  viewer: Pick<BaseProfile, "id" | "role">;
};

export default function PostRowActions({ post, viewer }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const showDelete = canDeletePost(viewer, post);
  const showArchive = canArchivePost(viewer, post);

  if (!showDelete && !showArchive) return null;

  function handleDelete() {
    startTransition(async () => {
      const res = await deletePost(post.id);
      if (res.success) {
        toast.success("Artículo eliminado");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  function handleArchive() {
    startTransition(async () => {
      const res = await archivePost(post.id);
      if (res.success) {
        toast.success("Artículo archivado");
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  }

  return (
    <>
      {showDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              disabled={isPending}
              aria-label="Eliminar"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Eliminar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Eliminar este artículo?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta acción no se puede deshacer. El artículo se borrará para
                siempre.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showArchive && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              aria-label="Archivar"
            >
              <Archive className="h-4 w-4 mr-1" />
              Archivar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Archivar este artículo?</AlertDialogTitle>
              <AlertDialogDescription>
                El artículo dejará de ser visible en el blog. Más adelante un
                admin puede restaurarlo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>
                Cancelar
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleArchive} disabled={isPending}>
                Archivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
