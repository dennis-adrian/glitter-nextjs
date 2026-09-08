"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Label } from "@/app/components/ui/label";
import { Switch } from "@/app/components/ui/switch";
import { setCommentsEnabled } from "@/app/lib/posts/actions";

type Props = {
  postId: number;
  initialEnabled: boolean;
};

/**
 * Opens or closes the article's comment thread.
 *
 * Saves on its own rather than riding the form's submit, because it is not an
 * editorial change: on a published post every other field here stages and
 * waits for review, and a thread you need to shut cannot wait for that. The
 * action mirrors that — it writes straight to the live row.
 */
export default function CommentsToggle({ postId, initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  const change = async (next: boolean) => {
    // Optimistic: the switch is the kind of control that feels broken if it
    // lags. Reverted below if the server disagrees.
    setEnabled(next);
    setBusy(true);

    try {
      const result = await setCommentsEnabled(postId, next);
      if (!result.success) {
        setEnabled(!next);
        toast.error(result.message);
        return;
      }
      toast.success(next ? "Comentarios abiertos" : "Comentarios cerrados");
    } catch {
      setEnabled(!next);
      toast.error("No se pudo actualizar. Intentá de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="comments-enabled" className="text-base">
          Comentarios
        </Label>
        <Switch
          id="comments-enabled"
          checked={enabled}
          disabled={busy}
          onCheckedChange={change}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {enabled
          ? "Cualquiera que pueda leer el artículo puede comentar."
          : "Nadie puede comentar. Los comentarios que ya están se siguen viendo."}
      </p>
    </div>
  );
}
