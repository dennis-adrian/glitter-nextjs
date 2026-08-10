"use client";

import { useState } from "react";

import CodeScannerToggle from "@/app/components/molecules/code-scanner-toggle";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";

type Props = {
  onSubmit: (code: string) => void;
  disabled: boolean;
  scannerOpen: boolean;
  onToggleScanner: (open: boolean) => void;
};

/**
 * The always-present way into a check-in, and the place the camera is opened
 * from.
 *
 * Typing a code is the path that works everywhere — a cracked screen, a
 * printout, glare, a denied camera permission — so it is the one that is never
 * hidden. The camera is the faster path but not the reliable one, so it sits
 * behind the icon here and the operator decides when they want it.
 */
export default function CheckInManualForm({
  onSubmit,
  disabled,
  scannerOpen,
  onToggleScanner,
}: Props) {
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
          Código de la entrada
        </label>
        <Input
          id="ticket-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Ingresa o escanea el código"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          disabled={disabled}
        />
      </div>
      <CodeScannerToggle
        open={scannerOpen}
        onToggle={onToggleScanner}
        disabled={disabled}
      />
      <Button type="submit" disabled={disabled || !code.trim()}>
        Verificar
      </Button>
    </form>
  );
}
