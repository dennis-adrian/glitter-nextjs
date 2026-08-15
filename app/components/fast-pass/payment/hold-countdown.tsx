"use client";

import { useEffect, useState } from "react";

type Props = {
  expiresAt: Date | null;
  label?: string;
};

function formatRemaining(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export default function FastPassHoldCountdown({
  expiresAt,
  label = "Tiempo restante para subir comprobante",
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [clock, setClock] = useState(0);

  useEffect(() => {
    let interval: number | undefined;
    const initialTick = window.setTimeout(() => {
      setMounted(true);
      const now = Date.now();
      setClock(now);
      if (!expiresAt || now >= expiresAt.getTime()) return;

      interval = window.setInterval(() => {
        const nextClock = Date.now();
        setClock(nextClock);
        if (nextClock >= expiresAt.getTime()) {
          window.clearInterval(interval);
        }
      }, 1000);
    }, 0);

    return () => {
      window.clearTimeout(initialTick);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [expiresAt]);

  if (!mounted || !expiresAt) return null;

  const msLeft = expiresAt.getTime() - clock;
  const expired = msLeft <= 0;

  return (
    <p
      className={`text-sm font-medium ${expired ? "text-destructive" : "text-foreground"}`}
    >
      {label}: {expired ? "Expirado" : formatRemaining(msLeft)}
    </p>
  );
}
