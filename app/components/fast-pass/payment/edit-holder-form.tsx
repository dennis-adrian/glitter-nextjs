"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { updateFastPassHolder } from "@/app/lib/fast-pass/holder-actions";

type Gender = "male" | "female" | "non_binary" | "other" | "undisclosed";

export default function FastPassEditHolderForm(props: {
  purchaseId: number;
  purchaseLineId: number;
  token: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  gender: Gender;
  birthdate: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [values, setValues] = useState({
    firstName: props.firstName,
    lastName: props.lastName,
    email: props.email,
    phone: props.phone,
    gender: props.gender,
    birthdate: props.birthdate,
  });

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      const result = await updateFastPassHolder({
        purchaseId: props.purchaseId,
        purchaseLineId: props.purchaseLineId,
        token: props.token,
        ...values,
      });
      if (!result.success) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      router.refresh();
    } catch {
      toast.error("No pudimos actualizar el titular");
    } finally {
      setPending(false);
    }
  }

  return (
    <details className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">
        Cambiar titular
      </summary>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["firstName", "lastName", "email", "phone"] as const).map((field) => (
          <div key={field} className="space-y-1">
            <Label htmlFor={`${field}-${props.purchaseLineId}`}>
              {
                {
                  firstName: "Nombre",
                  lastName: "Apellido",
                  email: "Correo",
                  phone: "Teléfono",
                }[field]
              }
            </Label>
            <Input
              id={`${field}-${props.purchaseLineId}`}
              type={
                field === "email" ? "email" : field === "phone" ? "tel" : "text"
              }
              value={values[field]}
              required
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  [field]: event.target.value,
                }))
              }
            />
          </div>
        ))}
        <div className="space-y-1">
          <Label htmlFor={`gender-${props.purchaseLineId}`}>Género</Label>
          <select
            id={`gender-${props.purchaseLineId}`}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={values.gender}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                gender: event.target.value as Gender,
              }))
            }
          >
            <option value="undisclosed">Prefiero no decir</option>
            <option value="female">Mujer</option>
            <option value="male">Hombre</option>
            <option value="non_binary">No binario</option>
            <option value="other">Otro</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`birthdate-${props.purchaseLineId}`}>
            Fecha de nacimiento
          </Label>
          <Input
            id={`birthdate-${props.purchaseLineId}`}
            type="date"
            value={values.birthdate}
            required
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                birthdate: event.target.value,
              }))
            }
          />
        </div>
        <Button className="sm:col-span-2" disabled={pending}>
          {pending ? "Guardando…" : "Guardar nuevo titular"}
        </Button>
      </form>
    </details>
  );
}
