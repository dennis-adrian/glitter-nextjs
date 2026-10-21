"use client";

import { useEffect, useState } from "react";
import { useDebounce } from "use-debounce";

import { Skeleton } from "@/app/components/ui/skeleton";
import { previewCreditGiftEmailAction } from "@/app/lib/credit_gifts/actions";

type PreviewState =
  | { status: "loading" }
  | { status: "ready"; subject: string; html: string }
  | { status: "error"; message: string };

/** Links open in a new tab instead of the frame; the frame runs no scripts. */
function previewDocument(html: string) {
  const base = '<base target="_blank">';
  return /<head[^>]*>/i.test(html)
    ? html.replace(/<head[^>]*>/i, (head) => `${head}${base}`)
    : `${base}${html}`;
}

/**
 * The gift email exactly as the sample recipient would get it, re-rendered on
 * the server a moment after the admin stops typing.
 */
export default function CreditGiftEmailPreview(props: {
  name: string | null;
  amount: number;
  title: string;
  message: string;
}) {
  const [input] = useDebounce(props, 500, {
    equalityFn: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  });
  const key = JSON.stringify(input);
  // Stored with the input it answers, so a stale answer reads as loading
  // instead of showing the email for words the admin already changed.
  const [answer, setAnswer] = useState<{
    key: string;
    state: PreviewState;
  } | null>(null);

  useEffect(() => {
    let current = true;
    const requestKey = JSON.stringify(input);
    previewCreditGiftEmailAction(input)
      .then((result) => {
        if (!current) return;
        setAnswer({
          key: requestKey,
          state: result.success
            ? { status: "ready", subject: result.subject, html: result.html }
            : { status: "error", message: result.message },
        });
      })
      .catch(() => {
        if (current) {
          setAnswer({
            key: requestKey,
            state: {
              status: "error",
              message: "No se pudo generar la vista previa del correo.",
            },
          });
        }
      });
    return () => {
      current = false;
    };
  }, [input]);

  const preview: PreviewState =
    answer?.key === key ? answer.state : { status: "loading" };

  if (preview.status === "error") {
    return (
      <p className="rounded-lg border p-3 text-sm text-muted-foreground">
        {preview.message}
      </p>
    );
  }
  if (preview.status === "loading") {
    return (
      <div className="space-y-2 rounded-lg border p-3" aria-busy="true">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <dl className="space-y-1 border-b bg-muted/40 p-3 text-sm">
        <div className="flex gap-2">
          <dt className="w-14 shrink-0 text-muted-foreground">De</dt>
          <dd className="min-w-0 break-words">Productora Glitter</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-14 shrink-0 text-muted-foreground">Asunto</dt>
          <dd className="min-w-0 break-words font-medium">{preview.subject}</dd>
        </div>
      </dl>
      <iframe
        title={`Vista previa: ${preview.subject}`}
        srcDoc={previewDocument(preview.html)}
        sandbox="allow-popups allow-popups-to-escape-sandbox"
        className="block h-[420px] w-full bg-white"
      />
    </div>
  );
}
