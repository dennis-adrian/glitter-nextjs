"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/app/components/ui/radio-group";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  addExtraCredential,
  updateExtraCredential,
} from "@/app/lib/credentials/actions";
import type { CredentialExtraRow } from "@/app/lib/credentials/calculate";
import {
  CREDENTIALS_COPY,
  EXTRA_LABEL_MAX,
  EXTRA_NAME_MAX,
  EXTRA_QUANTITY_MAX,
} from "@/app/lib/credentials/definitions";
import {
  extraCredentialFieldsSchema,
  updateExtraCredentialSchema,
} from "@/app/lib/credentials/schema";
import { toastActionError } from "@/app/lib/errors/action-error";
import { cn } from "@/app/lib/utils";

/**
 * "Agregar credencial" and "Editar" for "Solo para esta edición": a named
 * person, or a labelled lot of unnamed credentials ("Prensa", 6). A named
 * entry's name is what was printed, so editing keeps it.
 */
export default function ExtraCredentialDialog({
  festivalId,
  extra,
}: {
  festivalId: number;
  extra?: CredentialExtraRow;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"named" | "unnamed">(
    extra && extra.name == null ? "unnamed" : "named",
  );
  const [name, setName] = useState(extra?.name ?? "");
  const [label, setLabel] = useState(extra?.label ?? "");
  const [quantity, setQuantity] = useState(String(extra?.quantity ?? 1));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() {
    setKind(extra && extra.name == null ? "unnamed" : "named");
    setName(extra?.name ?? "");
    setLabel(extra?.label ?? "");
    setQuantity(String(extra?.quantity ?? 1));
    setError(null);
  }

  function save() {
    let call;
    if (extra) {
      const parsed = updateExtraCredentialSchema.safeParse({
        festivalId,
        extraCredentialId: extra.id,
        label,
        ...(extra.name == null ? { quantity } : {}),
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? CREDENTIALS_COPY.genericError);
        return;
      }
      call = () => updateExtraCredential(parsed.data);
    } else {
      const parsed = extraCredentialFieldsSchema.safeParse(
        kind === "named" ? { kind, name, label } : { kind, label, quantity },
      );
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? CREDENTIALS_COPY.genericError);
        return;
      }
      call = () => addExtraCredential({ festivalId, extra: parsed.data });
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await call();
        if (!result.success) {
          setError(result.message);
          return;
        }
        toast.success(result.message);
        setOpen(false);
        router.refresh();
      } catch (caught) {
        toastActionError(caught, CREDENTIALS_COPY.genericError);
      }
    });
  }

  const prefix = extra ? `extra-${extra.id}` : "extra-new";
  const named = extra ? extra.name != null : kind === "named";

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        // Held open while saving: the save closes the session that started it.
        if (!next && isPending) return;
        setOpen(next);
        if (next) reset();
      }}
    >
      <DrawerDialogTrigger isDesktop={isDesktop}>
        {extra ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Editar ${extra.name ?? extra.label}`}
          >
            Editar
          </Button>
        ) : (
          <Button type="button" variant="outline" wrap>
            <PlusIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            Agregar credencial
          </Button>
        )}
      </DrawerDialogTrigger>
      <DrawerDialogContent isDesktop={isDesktop} className="sm:max-w-md">
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle isDesktop={isDesktop} className="text-left wrap-anywhere">
            {extra ? `Editar ${extra.name ?? extra.label}` : "Agregar credencial para esta edición"}
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop} className="text-left">
            Para personas invitadas, prensa o apoyo puntual. Solo cuenta en esta edición.
          </DrawerDialogDescription>
        </DrawerDialogHeader>
        <form
          className={cn("flex flex-col gap-4", !isDesktop && "px-4 pb-4")}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          noValidate
        >
          {!extra && (
            <RadioGroup
              value={kind}
              onValueChange={(value) => setKind(value as "named" | "unnamed")}
              aria-label="Tipo de credencial"
              className="flex flex-col gap-2"
            >
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <RadioGroupItem value="named" id={`${prefix}-named`} />
                Una persona, con su nombre
              </label>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <RadioGroupItem value="unnamed" id={`${prefix}-unnamed`} />
                Varias sin nombre
              </label>
            </RadioGroup>
          )}
          {named && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${prefix}-name`}>Nombre en la credencial</Label>
              {extra ? (
                <p id={`${prefix}-name`} className="text-sm font-medium wrap-anywhere">
                  {extra.name}
                </p>
              ) : (
                <Input
                  id={`${prefix}-name`}
                  value={name}
                  maxLength={EXTRA_NAME_MAX}
                  autoComplete="off"
                  onChange={(event) => setName(event.target.value)}
                />
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${prefix}-label`}>{named ? "Para qué es" : "Para qué son"}</Label>
            <Input
              id={`${prefix}-label`}
              value={label}
              maxLength={EXTRA_LABEL_MAX}
              placeholder={named ? "Fotografía" : "Prensa"}
              autoComplete="off"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          {!named && (
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${prefix}-quantity`}>Cantidad</Label>
              <Input
                id={`${prefix}-quantity`}
                type="number"
                inputMode="numeric"
                min={1}
                max={EXTRA_QUANTITY_MAX}
                className="w-24"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={isPending} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
