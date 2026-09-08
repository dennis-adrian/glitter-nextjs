"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import CommentForm from "@/app/components/blog/comment-form";
import { Button } from "@/app/components/ui/button";
import { deleteOwnComment, hideComment } from "@/app/lib/posts/comment-actions";
import type { CommentNode } from "@/app/lib/posts/definitions";
import { postAuthorName } from "@/app/lib/posts/helpers";

type Props = {
  postId: number;
  comment: CommentNode | Omit<CommentNode, "replies">;
  viewerId: number | null;
  viewerIsStaff: boolean;
  canReply: boolean;
  canComment: boolean;
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function CommentItem({
  postId,
  comment,
  viewerId,
  viewerIsStaff,
  canReply,
  canComment,
}: Props) {
  const [replying, setReplying] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const replies = "replies" in comment ? comment.replies : [];
  const name = postAuthorName(comment.user);
  const isOwn = viewerId !== null && comment.userId === viewerId;

  function run(action: () => Promise<{ success: boolean; message?: string }>) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) {
          toast.error(result.message ?? "No se pudo completar la acción");
          return;
        }
        router.refresh();
      } catch {
        // The actions return `{ success: false }` for anything they can
        // foresee, so a rejection here is the transport failing. Left uncaught
        // it takes the whole article down with the error boundary.
        toast.error("No se pudo completar la acción. Intentá de nuevo.");
      }
    });
  }

  return (
    <li className="grid gap-2">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
          {initials(name) || "G"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{name}</p>
          <p className="mt-1 text-sm whitespace-pre-wrap break-words">
            {comment.body}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <time dateTime={new Date(comment.createdAt).toISOString()}>
              {new Date(comment.createdAt).toLocaleDateString("es-BO", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
            {canReply && canComment && (
              <button
                type="button"
                className="hover:text-foreground"
                onClick={() => setReplying((open) => !open)}
              >
                Responder
              </button>
            )}
            {isOwn && (
              <button
                type="button"
                className="hover:text-foreground disabled:opacity-50"
                disabled={pending}
                onClick={() => run(() => deleteOwnComment(comment.id))}
              >
                Borrar
              </button>
            )}
            {viewerIsStaff && !isOwn && (
              <button
                type="button"
                className="hover:text-foreground disabled:opacity-50"
                disabled={pending}
                onClick={() => run(() => hideComment(comment.id))}
              >
                Ocultar
              </button>
            )}
          </div>

          {replying && (
            <div className="mt-3">
              <CommentForm
                postId={postId}
                parentId={comment.id}
                autoFocus
                placeholder="Escribí una respuesta…"
                onDone={() => setReplying(false)}
              />
            </div>
          )}
        </div>
      </div>

      {replies.length > 0 && (
        <ul className="ml-11 grid gap-4 border-l pl-4">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              postId={postId}
              comment={reply}
              viewerId={viewerId}
              viewerIsStaff={viewerIsStaff}
              canReply={false}
              canComment={canComment}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
