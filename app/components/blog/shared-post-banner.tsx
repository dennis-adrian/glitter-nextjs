import { LinkIcon } from "lucide-react";

import {
  POST_STATUS_LABELS,
  type PostStatus,
} from "@/app/lib/posts/definitions";

/**
 * Tells the recipient what they are holding. Without this, a shared draft is
 * indistinguishable from a published article, and someone would reasonably
 * link to it or quote it as final.
 */
export default function SharedPostBanner({
  status,
  authorName,
}: {
  status: PostStatus;
  authorName: string;
}) {
  const isPublished = status === "published";

  return (
    <div className="flex items-start gap-2 rounded-md border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <LinkIcon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium">
          {isPublished
            ? "Artículo compartido con vos"
            : "Borrador compartido con vos"}
        </p>
        <p className="text-sky-800">
          {isPublished ? (
            <>
              {authorName} te compartió este artículo mediante un enlace
              privado.
            </>
          ) : (
            <>
              {authorName} te compartió este artículo antes de publicarlo
              (estado: {POST_STATUS_LABELS[status].toLowerCase()}). Todavía
              puede cambiar, y no aparece en el blog público.
            </>
          )}
        </p>
      </div>
    </div>
  );
}
