"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import ImageUploadField from "@/app/components/molecules/image-upload-field";
import ImpactConfirmDialog from "@/app/components/organisms/impact-confirm-dialog";
import RichTextEditor from "@/app/components/organisms/rich-text-editor";
import { Alert, AlertDescription } from "@/app/components/ui/alert";
import { Button } from "@/app/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/app/components/ui/form";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
import { Switch } from "@/app/components/ui/switch";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "@/app/lib/categories/actions";
import {
  formatDeleteBlockedMessage,
  formatDeleteWarningMessage,
  MANAGEMENT_AREA_OPTIONS,
  RENAME_MOVE_WARNING,
  VISIBILITY_COPY,
  categoryParticipantsHref,
} from "@/app/lib/categories/copy";
import { isDeleteBlocked, shouldWarnRenameMove, unverifiedLinkedCounts } from "@/app/lib/categories/delete";
import type {
  AdminCategory,
  CategoryVisibility,
  ManagementArea,
} from "@/app/lib/categories/definitions";
import { participantCount } from "@/app/lib/categories/definitions";
import {
  categoryEditorSchema,
  type CategoryEditorInput,
} from "@/app/lib/categories/schema";

type CategoryEditorProps = {
  category?: AdminCategory | null;
  defaultArea?: ManagementArea;
};

export default function CategoryEditor({
  category,
  defaultArea = "illustration",
}: CategoryEditorProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const form = useForm<CategoryEditorInput>({
    resolver: zodResolver(categoryEditorSchema),
    defaultValues: {
      label: category?.label ?? "",
      category: (category?.category as ManagementArea | undefined) ?? defaultArea,
      descriptionJson: category?.descriptionJson ?? null,
      imageUrl: category?.imageUrl ?? null,
      imageFileKey: category?.imageFileKey ?? null,
      visibility: category?.visibility ?? "selectable",
      isExclusive: category?.isExclusive ?? false,
      isAdminAssignableOnly: category?.isAdminAssignableOnly ?? false,
    },
  });

  const areaChanged =
    category != null && form.watch("category") !== category.category;
  const nameChanged =
    category != null && form.watch("label").trim() !== category.label;
  const showRenameWarning = shouldWarnRenameMove(
    category != null && (areaChanged || nameChanged),
    category ?? {
      verified: 0,
      paused: 0,
      pending: 0,
      rejected: 0,
      banned: 0,
      stands: 0,
    },
  );

  const blocked = category ? isDeleteBlocked(category) : false;
  const warning = category
    ? formatDeleteWarningMessage(unverifiedLinkedCounts(category))
    : null;
  const participants = category ? participantCount(category) : 0;

  const action = form.handleSubmit((data) => {
    startTransition(async () => {
      const result = category
        ? await updateCategory(category.id, data)
        : await createCategory(data);
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.push("/dashboard/categories");
      router.refresh();
    });
  });

  return (
    <Form {...form}>
      <form onSubmit={action} className="space-y-6">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-background/95 py-3 backdrop-blur">
          <div className="min-w-0">
            <Link
              href="/dashboard/categories"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Categorías
            </Link>
            <h1 className="truncate text-xl font-semibold">
              {form.watch("label") || (category ? "Editar categoría" : "Nueva categoría")}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {category ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                Eliminar
              </Button>
            ) : null}
            <Button type="button" variant="outline" asChild>
              <Link href="/dashboard/categories">Descartar</Link>
            </Button>
            <Button type="submit" disabled={isPending || form.formState.isSubmitting}>
              Guardar
            </Button>
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Contenido</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre</FormLabel>
                      <FormControl>
                        <Input placeholder="Crochet" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Área</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Elige un área" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MANAGEMENT_AREA_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {showRenameWarning ? (
                        <Alert className="mt-2">
                          <AlertDescription>{RENAME_MOVE_WARNING}</AlertDescription>
                        </Alert>
                      ) : null}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="descriptionJson"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <RichTextEditor
                          variant="compact"
                          initialContent={field.value}
                          placeholder="Describe la categoría. Escribe / para insertar un bloque."
                          onChange={(json) => field.onChange(json)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
            {category ? (
              <Card>
                <CardHeader>
                  <CardTitle>Uso</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">
                        {participants}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {participants === 1 ? "participante" : "participantes"}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold tabular-nums">
                        {category.stands}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {category.stands === 1 ? "stand" : "stands"}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {category.verified} verificados · {category.pending}{" "}
                    pendientes
                  </p>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Visibilidad</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="visibility"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange(value as CategoryVisibility)
                      }
                      className="space-y-3"
                    >
                      {(
                        Object.keys(VISIBILITY_COPY) as CategoryVisibility[]
                      ).map((value) => (
                        <div key={value} className="flex items-start gap-3">
                          <RadioGroupItem value={value} id={`vis-${value}`} />
                          <Label htmlFor={`vis-${value}`} className="space-y-1 font-normal">
                            <span className="block font-medium">
                              {VISIBILITY_COPY[value].controlLabel}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {VISIBILITY_COPY[value].help}
                            </span>
                          </Label>
                        </div>
                      ))}
                    </RadioGroup>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Imagen</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="imageUrl"
                  render={({ field }) => (
                    <ImageUploadField
                      value={field.value}
                      fileKey={form.watch("imageFileKey")}
                      onChange={(url, nextFileKey) => {
                        field.onChange(url);
                        form.setValue("imageFileKey", nextFileKey ?? null);
                      }}
                      alt={form.watch("label") || "Categoría"}
                    />
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reglas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="isExclusive"
                  render={({ field }) => (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Exclusiva</p>
                        <p className="text-xs text-muted-foreground">
                          No se puede combinar con otras categorías.
                        </p>
                      </div>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </div>
                  )}
                />
                <FormField
                  control={form.control}
                  name="isAdminAssignableOnly"
                  render={({ field }) => (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Solo asignación admin</p>
                        <p className="text-xs text-muted-foreground">
                          Oculta en el alta; un admin puede asignarla.
                        </p>
                      </div>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </div>
                  )}
                />
              </CardContent>
            </Card>
          </aside>
        </div>
      </form>

      {category ? (
        <ImpactConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={`Eliminar ${category.label}`}
          description={
            blocked
              ? formatDeleteBlockedMessage(
                  category.label,
                  category.verified,
                  category.paused,
                  category.stands,
                )
              : warning || "Esta acción no se puede deshacer."
          }
          items={[
            {
              label: "Perfiles verificados",
              count: category.verified,
              tone: category.verified > 0 ? "danger" : "default",
            },
            {
              label: "Pausados",
              count: category.paused,
              tone: category.paused > 0 ? "danger" : "default",
            },
            {
              label: "Stands",
              count: category.stands,
              tone: category.stands > 0 ? "danger" : "default",
            },
          ]}
          blocked={blocked}
          secondaryHref={
            blocked && (category.verified > 0 || category.paused > 0)
              ? categoryParticipantsHref(category.category)
              : undefined
          }
          secondaryLabel={
            blocked && (category.verified > 0 || category.paused > 0)
              ? "Ver perfiles"
              : undefined
          }
          confirmLabel="Eliminar categoría"
          confirmPending={isPending}
          onConfirm={() => {
            if (blocked) return;
            startTransition(async () => {
              const result = await deleteCategory(category.id);
              if (!result.success) {
                toast.error(result.message);
                return;
              }
              toast.success(result.message);
              router.push("/dashboard/categories");
              router.refresh();
            });
          }}
        />
      ) : null}
    </Form>
  );
}
