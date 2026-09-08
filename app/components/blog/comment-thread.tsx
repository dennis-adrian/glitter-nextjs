import Link from "next/link";

import CommentForm from "@/app/components/blog/comment-form";
import CommentItem from "@/app/components/blog/comment-item";
import { Button } from "@/app/components/ui/button";
import type { CommentNode } from "@/app/lib/posts/definitions";

type Props = {
  postId: number;
  postSlug: string;
  comments: CommentNode[];
  viewerId: number | null;
  viewerIsStaff: boolean;
  /** True when the viewer may not read the article itself. */
  gated: boolean;
  /**
   * False when the reader may see the article but not write on it — signed
   * out, or signed in without access to a restricted post.
   */
  canComment: boolean;
  /**
   * The author closed the thread. Distinct from `canComment`: that one is
   * about this reader, this one is about the article, and they need different
   * messages — telling someone to sign in to a closed thread is a dead end.
   */
  closed: boolean;
};

export default function CommentThread({
  postId,
  postSlug,
  comments,
  viewerId,
  viewerIsStaff,
  gated,
  canComment,
  closed,
}: Props) {
  const total = comments.reduce(
    (sum, comment) => sum + 1 + comment.replies.length,
    0,
  );

  /**
   * The discussion is part of the article. Showing it to someone who cannot
   * read the article is both incoherent and a leak — a thread quotes and
   * summarises what it is about — so the gate covers the whole section.
   */
  if (gated) {
    return (
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold">Comentarios</h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Los comentarios de este artículo son visibles solo para participantes
          verificados.
        </p>
      </section>
    );
  }

  /**
   * A closed thread with nothing under it has nothing to say: no form to
   * disable, no discussion to frame. Two notices explaining an empty section
   * are worse than no section, so the whole thing goes. Once a comment exists
   * the section comes back, closed notice and all — the thread is content
   * then, not an absent feature.
   */
  if (closed && total === 0) {
    return null;
  }

  return (
    <section className="mt-12 border-t pt-8">
      <h2 className="text-xl font-semibold">
        {total === 0
          ? "Comentarios"
          : total === 1
            ? "1 comentario"
            : `${total} comentarios`}
      </h2>

      {closed ? (
        /*
         * Closed, not erased: the comments already posted stay above. Saying
         * so plainly beats a missing form, which reads as something broken.
         */
        <div className="mt-4 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          Los comentarios de este artículo están cerrados.
        </div>
      ) : canComment ? (
        <div className="mt-4">
          <CommentForm postId={postId} />
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <span>Iniciá sesión para dejar un comentario.</span>
          <Button asChild size="sm" variant="outline">
            <Link
              href={`/sign_in?returnUrl=${encodeURIComponent(`/blog/${postSlug}`)}`}
            >
              Iniciar sesión
            </Link>
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
              // A closed thread takes no replies either; `addComment` refuses
              // them regardless, this keeps the reply box from lying.
              canComment={canComment && !closed}
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
