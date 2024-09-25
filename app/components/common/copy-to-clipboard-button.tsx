"use client";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import { CheckIcon, CopyCheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function CopyToClipboardButton({
  className,
  text = "",
  label,
  toastLabel,
  iconOnly = false,
}: {
  className?: string;
  text: string;
  label?: string;
  toastLabel?: string;
  iconOnly?: boolean;
} & React.HTMLAttributes<HTMLButtonElement>) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      const toastText = toastLabel || `"${text}" copiado al portapapeles`;
      navigator.clipboard.writeText(text);
      toast(toastText);
      const timeout = setTimeout(() => {
        setCopied(false);
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [copied, toastLabel, text]);

  if (iconOnly) {
    return copied ? (
      <>
        <CopyCheckIcon className="w-4 h-4 ml-2" />
      </>
    ) : (
      <span onClick={() => setCopied(true)}>
        <CopyIcon className="w-4 h-4 ml-2" />
      </span>
    );
  }

  return (
    <Button
      className={cn("transition ease-in-out duration-300", className)}
      disabled={copied}
      size="sm"
      variant="outline"
      onClick={() => setCopied(true)}
    >
      {copied ? (
        <>
          Copiado
          <CheckIcon className="w-4 h-4 ml-2" />
        </>
      ) : (
        <>
          {label || "Copiar"}
          <CopyIcon className="w-4 h-4 ml-2" />
        </>
      )}
    </Button>
  );
}
