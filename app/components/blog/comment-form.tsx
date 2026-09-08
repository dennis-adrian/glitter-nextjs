"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Textarea } from "@/app/components/ui/textarea";
import { addComment } from "@/app/lib/posts/comment-actions";
import { COMMENT_MAX_LENGTH } from "@/app/lib/posts/definitions";

type Props = {
  postId: number;
  parentId?: number;
  placeholder?: string;
  autoFocus?: boolean;
  onDone?: () => void;
};

export default function CommentForm({
  postId,
  parentId,
  placeholder = "Escribí un comentario…",
  autoFocus,
  onDone,
}: Props) {
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const trimmed = body.trim();
  const tooLong = trimmed.length > COMMENT_MAX_LENGTH;
  const canSubmit = trimmed.length > 0 && !tooLong && !pending;

  function submit() {
    startTransition(async () => {
      const result = await addComment(postId, trimmed, parentId);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      setBody("");
      onDone?.();
      router.refresh();
    });
  }

  return (
    <div className="grid gap-2">
      <Textarea
        value={body}
        autoFocus={autoFocus}
        placeholder={placeholder}
        rows={parentId ? 2 : 3}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex items-center justify-between gap-3">
        <span
          className={
            tooLong
              ? "text-xs text-destructive"
              : "text-xs text-muted-foreground"
          }
        >
          {trimmed.length}/{COMMENT_MAX_LENGTH}
        </span>
        <div className="flex gap-2">
          {onDone && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onDone}
              disabled={pending}
            >
              Cancelar
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={!canSubmit}
          >
            {pending ? "Enviando…" : parentId ? "Responder" : "Comentar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
