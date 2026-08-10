"use client";

import { useState } from "react";

import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

type Props = {
  onSubmit: (code: string) => void;
  disabled: boolean;
};

/**
 * The fallback when a QR will not read — a cracked screen, a printout, glare.
 *
 * Kept beside the camera rather than behind a toggle: an operator reaches for
 * it exactly when something has already gone wrong, which is the worst moment
 * to make them hunt for it.
 */
export default function CheckInManualForm({ onSubmit, disabled }: Props) {
  const [code, setCode] = useState("");

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = code.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setCode("");
      }}
    >
      <div className="flex-1 space-y-1">
        <label
          htmlFor="ticket-code"
          className="text-xs font-medium text-muted-foreground"
        >
          ¿No escanea? Ingresa el código
        </label>
        <Input
          id="ticket-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Código de la entrada"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
        />
      </div>
      <Button type="submit" disabled={disabled || !code.trim()}>
        Verificar
      </Button>
    </form>
  );
}
