"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Textarea } from "@/app/components/ui/textarea";
import type { BaseProductContentSection } from "@/app/lib/products/definitions";
import {
  deleteProductContentSection,
  upsertProductContentSection,
} from "@/app/lib/rentals/content-section-actions";

type ProductContentSectionsEditorProps = {
  productId: number;
  sections: BaseProductContentSection[];
};

export default function ProductContentSectionsEditor({
  productId,
  sections: initialSections,
}: ProductContentSectionsEditorProps) {
  const [sections, setSections] = useState(initialSections);
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState<"free_text" | "bullet_list">(
    "free_text",
  );
  const [body, setBody] = useState("");
  const [displayContext, setDisplayContext] = useState<
    "all" | "purchase" | "rental"
  >("all");

  function refreshFromServer() {
    window.location.reload();
  }

  return (
    <div className="mt-8 space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="text-base font-semibold">Secciones de contenido</h3>
        <p className="text-sm text-muted-foreground">
          Instrucciones, garantía, proceso de alquiler, etc.
        </p>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no hay secciones configuradas.
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => (
            <div key={section.id} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">{section.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {section.displayContext} · {section.format}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={isPending}
                  onClick={() => {
                    startTransition(async () => {
                      const result = await deleteProductContentSection(
                        section.id,
                        productId,
                      );
                      if (!result.success) {
                        toast.error(result.message);
                        return;
                      }
                      setSections((current) =>
                        current.filter((entry) => entry.id !== section.id),
                      );
                      toast.success(result.message);
                    });
                  }}
                >
                  Eliminar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 border-t pt-4">
        <div className="grid gap-2">
          <Label htmlFor="section-title">Título</Label>
          <Input
            id="section-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label>Formato</Label>
          <Select
            value={format}
            onValueChange={(value) =>
              setFormat(value as "free_text" | "bullet_list")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free_text">Texto libre</SelectItem>
              <SelectItem value="bullet_list">Lista</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label>Contexto</Label>
          <Select
            value={displayContext}
            onValueChange={(value) =>
              setDisplayContext(value as "all" | "purchase" | "rental")
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="purchase">Compra</SelectItem>
              <SelectItem value="rental">Alquiler</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {format === "free_text" ? (
          <div className="grid gap-2">
            <Label htmlFor="section-body">Contenido</Label>
            <Textarea
              id="section-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
        ) : (
          <div className="grid gap-2">
            <Label htmlFor="section-items">Elementos (uno por línea)</Label>
            <Textarea
              id="section-items"
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
        )}
        <Button
          type="button"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              const result = await upsertProductContentSection(productId, {
                title,
                format,
                displayContext,
                body: format === "free_text" ? body : null,
                items:
                  format === "bullet_list"
                    ? body.split("\n").map((line) => line.trim())
                    : null,
                sortOrder: sections.length,
              });
              if (!result.success) {
                toast.error(result.message);
                return;
              }
              toast.success(result.message);
              refreshFromServer();
            });
          }}
        >
          Agregar sección
        </Button>
      </div>
    </div>
  );
}
