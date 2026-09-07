import Link from "next/link";

import CommentForm from "@/app/components/blog/comment-form";
import CommentItem from "@/app/components/blog/comment-item";
import { Button } from "@/app/components/ui/button";
import type { CommentNode } from "@/app/lib/posts/definitions";

type Props = {
  postId: number;
  comments: CommentNode[];
  viewerId: number | null;
  viewerIsStaff: boolean;
  /**
   * False when the reader may see the article but not write on it — signed
   * out, or signed in without access to a restricted post.
   */
  canComment: boolean;
};

export default function CommentThread({
  postId,
  comments,
  viewerId,
  viewerIsStaff,
  canComment,
}: Props) {
  const total = comments.reduce(
    (sum, comment) => sum + 1 + comment.replies.length,
    0,
  );

  return (
    <section className="mt-12 border-t pt-8">
      <h2 className="text-xl font-semibold">
        {total === 0
          ? "Comentarios"
          : total === 1
            ? "1 comentario"
            : `${total} comentarios`}
      </h2>

      {canComment ? (
        <div className="mt-4">
          <CommentForm postId={postId} />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <span>Iniciá sesión para dejar un comentario.</span>
          <Button asChild size="sm" variant="outline">
            <Link href="/sign-in">Iniciar sesión</Link>
          </Button>
        </div>
      )}

      {comments.length > 0 ? (
        <ul className="mt-8 grid gap-6">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              postId={postId}
              comment={comment}
              viewerId={viewerId}
              viewerIsStaff={viewerIsStaff}
              canReply
              canComment={canComment}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Todavía no hay comentarios. Sé la primera persona en escribir uno.
        </p>
      )}
    </section>
  );
}
