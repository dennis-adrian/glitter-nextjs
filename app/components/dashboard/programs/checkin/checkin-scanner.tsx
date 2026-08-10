"use client";

import { useEffect, useRef, useState } from "react";

/** How long the same code is ignored after it decodes. */
const REPEAT_COOLDOWN_MS = 3000;

type Props = {
  onDecode: (code: string) => void;
  /** Decodes are dropped while the previous one is still being processed. */
  paused: boolean;
};

/**
 * Live camera preview that reports decoded QR payloads.
 *
 * The camera is started once and left running — including while a result
 * banner is up. Tearing it down per scan costs a permission-free but visibly
 * slow re-acquisition on phones, which at a door reads as the app being broken.
 *
 * ZXing is imported lazily inside the effect for two reasons: it touches
 * browser APIs that do not exist during the server pre-render of this client
 * component, and it is large enough that no page which never opens the scanner
 * should pay for it.
 */
export default function CheckInScanner({ onDecode, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Read inside the decode callback, which ZXing registers once. Props captured
   * by that closure would be frozen at their first value, so both live in refs.
   */
  const pausedRef = useRef(paused);
  const onDecodeRef = useRef(onDecode);
  const lastRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | null = null;

    async function start() {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        // Unmounted while the chunk was loading: never touch the camera.
        if (cancelled || !videoRef.current) return;

        const reader = new BrowserQRCodeReader();
        const scannerControls = await reader.decodeFromVideoDevice(
          // Undefined asks for `facingMode: environment` — the rear camera,
          // which is the one pointed at a phone screen being presented.
          undefined,
          videoRef.current,
          (result) => {
            if (!result || pausedRef.current) return;

            const code = result.getText();
            const now = Date.now();
            const last = lastRef.current;

            /**
             * A QR sits in frame for seconds and decodes on every video frame.
             * Without this the first presentation fires dozens of identical
             * check-ins, each answered "ya fue usada" — the correct record, but
             * a screen the operator cannot read past.
             */
            if (
              last &&
              last.code === code &&
              now - last.at < REPEAT_COOLDOWN_MS
            ) {
              return;
            }

            lastRef.current = { code, at: now };
            onDecodeRef.current(code);
          },
        );

        if (cancelled) {
          scannerControls.stop();
          return;
        }

        controls = scannerControls;
        setReady(true);
      } catch {
        if (cancelled) return;
        setError(
          "No pudimos abrir la cámara. Revisa los permisos del navegador o ingresa el código manualmente.",
        );
      }
    }

    void start();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, []);

  if (error) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {error}
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border bg-black">
      {/* `playsInline` and `muted` are what stop iOS Safari from taking the
          preview fullscreen and from refusing to autoplay it. */}
      <video
        ref={videoRef}
        className="aspect-square w-full object-cover"
        playsInline
        muted
      />
      {!ready ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
          Abriendo la cámara…
        </p>
      ) : null}
      {paused ? (
        <div className="absolute inset-0 bg-black/40" aria-hidden="true" />
      ) : null}
    </div>
  );
}
