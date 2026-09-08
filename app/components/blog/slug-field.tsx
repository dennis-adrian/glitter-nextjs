"use client";

import { CheckIcon, LoaderIcon, TriangleAlertIcon } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { checkSlugAvailability } from "@/app/lib/posts/actions";
import { PLACEHOLDER_SLUG_RE } from "@/app/lib/posts/definitions";
import { slugifyName } from "@/app/lib/posts/slug";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "free" }
  | { kind: "taken"; suggestion: string }
  | { kind: "error" };

/**
 * The slug, with the two things PRD §7.1 asks for: a live preview of the URL
 * the article will actually live at, and an availability check on blur.
 *
 * The server still auto-suffixes on save, so this cannot be the only defence
 * against a collision — two authors can pass the check a second apart. What it
 * buys is telling the author *before* they publish that the slug they typed is
 * not the one they are going to get.
 */
export default function SlugField({
  postId,
  slugPreview,
}: {
  postId: number;
  slugPreview: string;
}) {
  const form = useFormContext();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const value: string = form.watch("slug") ?? "";
  const title: string = form.watch("title") ?? "";

  /**
   * What the reader will actually see.
   *
   * A fresh draft carries the `borrador` placeholder, which the server swaps
   * for a title-derived slug the first time the post leaves `draft`. Treating
   * it as a chosen slug made the preview promise `/blog/borrador` for an
   * article that would publish at `/blog/guia-de-...`, which is exactly the
   * lie this field exists to prevent.
   */
  const typed = value.trim();
  const chosen = typed && !PLACEHOLDER_SLUG_RE.test(typed) ? typed : "";
  const effective = chosen || slugifyName(title || "") || slugPreview;

  const requestRef = useRef(0);

  const check = useCallback(
    async (candidate: string) => {
      const normalized = candidate.trim();
      // Blur fires again while a check is still in flight, so every call takes
      // a ticket and only the latest one is allowed to paint. Clearing the
      // field counts too, or a late "Disponible" lands on an empty input.
      const version = ++requestRef.current;
      if (!normalized) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({ kind: "checking" });
      try {
        const result = await checkSlugAvailability(postId, normalized);
        if (requestRef.current !== version) return;
        setStatus(
          result.available
            ? { kind: "free" }
            : { kind: "taken", suggestion: result.suggestion },
        );
      } catch (error) {
        if (requestRef.current !== version) return;
        console.error("checkSlugAvailability", error);
        setStatus({ kind: "error" });
      }
    },
    [postId],
  );

  return (
    <div className="grid gap-2">
      <Label htmlFor="post-slug">Slug (URL)</Label>
      <Input
        id="post-slug"
        placeholder="se-genera-automaticamente"
        {...form.register("slug")}
        onBlur={(event) => {
          form.register("slug").onBlur(event);
          void check(event.target.value);
        }}
      />

      <p className="text-xs text-muted-foreground break-all">
        Se publicará en{" "}
        <span className="font-medium text-foreground">/blog/{effective}</span>
      </p>

      {status.kind === "checking" && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <LoaderIcon className="size-3 animate-spin" />
          Verificando disponibilidad…
        </p>
      )}
      {status.kind === "free" && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-600">
          <CheckIcon className="size-3" />
          Disponible
        </p>
      )}
      {status.kind === "taken" && (
        <p className="flex items-start gap-1.5 text-xs text-amber-600">
          <TriangleAlertIcon className="mt-px size-3 shrink-0" />
          <span>
            Ya hay un artículo con ese slug. Si lo dejás así, se publicará como{" "}
            <span className="font-medium">/blog/{status.suggestion}</span>.
          </span>
        </p>
      )}
      {status.kind === "error" && (
        <p className="flex items-center gap-1.5 text-xs text-destructive">
          <TriangleAlertIcon className="size-3" />
          No se pudo verificar la disponibilidad. Intentá de nuevo.
        </p>
      )}
      {status.kind === "idle" && (
        <p className="text-xs text-muted-foreground">
          Dejalo en blanco para generarlo desde el título.
        </p>
      )}
    </div>
  );
}
