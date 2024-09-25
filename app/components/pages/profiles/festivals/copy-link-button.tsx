"use client";

import CopyToClipboardButton from "@/app/components/common/copy-to-clipboard-button";

export default function CopyLinkButton() {
  return (
    <CopyToClipboardButton
      text={window.location.href}
      toastLabel="Enlace copiado al portapapeles"
      label="Copiar enlace"
    />
  );
}
