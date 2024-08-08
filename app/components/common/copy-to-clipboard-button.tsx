"use client";

import { Button } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";
import {
  CheckIcon,
  ClipboardCheckIcon,
  ClipboardIcon,
  CopyIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

export default function CopyToClipboardButton({
  className,
  text,
  label,
}: {
  className?: string;
  text: string;
  label?: string;
} & React.HTMLAttributes<HTMLButtonElement>) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (copied) {
      navigator.clipboard.writeText(text);
      const timeout = setTimeout(() => {
        setCopied(false);
      }, 2000);

      return () => clearTimeout(timeout);
    }
  }, [copied]);

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
