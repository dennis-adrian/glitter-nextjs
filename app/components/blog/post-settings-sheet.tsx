"use client";

import { Settings } from "lucide-react";
import { useState } from "react";
import type { Control } from "react-hook-form";

import CategoryMultiselect from "@/app/components/blog/category-multiselect";
import TagInput from "@/app/components/blog/tag-input";
import TextInput from "@/app/components/form/fields/text";
import TextareaInput from "@/app/components/form/fields/textarea";
import { Button } from "@/app/components/ui/button";
import { Label } from "@/app/components/ui/label";
import { Separator } from "@/app/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/app/components/ui/sheet";
import type { PostCategoryRow } from "@/app/lib/posts/definitions";

type Props = {
  formControl: Control<any>;
  categoryOptions: PostCategoryRow[];
  categoryIds: number[];
  onCategoryIdsChange: (ids: number[]) => void;
  tagInputs: string[];
  onTagInputsChange: (tags: string[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export default function PostSettingsSheet({
  formControl,
  categoryOptions,
  categoryIds,
  onCategoryIdsChange,
  tagInputs,
  onTagInputsChange,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (isControlled) {
      controlledOnOpenChange?.(next);
    } else {
      setInternalOpen(next);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="fixed bottom-4 right-4 z-30 hidden shadow-md md:flex"
        onClick={() => setOpen(true)}
      >
        <Settings className="mr-2 h-4 w-4" />
        Ajustes
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-md overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Ajustes del artículo</SheetTitle>
            <SheetDescription>
              Configura el slug, extracto, categorías, etiquetas y SEO.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 flex flex-col gap-6">
            <TextInput
              name="slug"
              label="Slug (URL)"
              placeholder="se-genera-automaticamente"
              description="Deja en blanco para generarlo desde el título"
            />

            <TextareaInput
              formControl={formControl}
              name="excerpt"
              label="Extracto"
              placeholder="Breve resumen para la lista pública (máx. 280 caracteres)"
              maxLength={280}
            />

            <Separator />

            <div className="grid gap-2">
              <Label>Categorías</Label>
              <CategoryMultiselect
                value={categoryIds}
                onChange={onCategoryIdsChange}
                options={categoryOptions}
              />
            </div>

            <div className="grid gap-2">
              <Label>Etiquetas</Label>
              <TagInput value={tagInputs} onChange={onTagInputsChange} />
            </div>

            <Separator />

            <div className="grid gap-4">
              <Label className="text-base">SEO</Label>
              <TextInput
                name="seoTitle"
                label="Título SEO"
                placeholder="Opcional — se usará el título principal si se deja vacío"
                maxLength={70}
              />
              <TextareaInput
                formControl={formControl}
                name="seoDescription"
                label="Descripción SEO"
                placeholder="Resumen para buscadores y redes (máx. 200 caracteres)"
                maxLength={200}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
