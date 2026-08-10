"use client";

import { Loader2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/app/components/ui/button";
import { playScanBeep } from "@/app/lib/scanner/beep";
import { cn } from "@/app/lib/utils";

/**
 * Symbologies a caller can ask for, kept as plain strings on purpose.
 *
 * ZXing's own `BarcodeFormat` is an enum living in `@zxing/library`; accepting
 * it here would force every page that merely *renders* this component to import
 * that library at module scope, which is exactly the cost the lazy import below
 * exists to avoid. The mapping to the enum happens inside the effect, after the
 * chunk has loaded.
 */
export type ScanFormat = "qr_code" | "code_128" | "code_39" | "ean_13";

/** Program tickets are QR; festival tickets are printed as CODE_128 as well. */
const DEFAULT_FORMATS: ScanFormat[] = ["qr_code"];

/** How long the same payload is ignored after it decodes. */
const DEFAULT_COOLDOWN_MS = 3000;

type Props = {
  /** Called with the raw decoded payload. Interpreting it is the caller's job. */
  onScan: (code: string) => void;
  /**
   * Blocks decoding and covers the preview while the caller verifies a scan.
   * The camera keeps running underneath.
   */
  busy?: boolean;
  busyLabel?: string;
  /** Renders the close control when provided. */
  onClose?: () => void;
  formats?: ScanFormat[];
  cooldownMs?: number;
  /** A tone on every accepted read, the way a handheld scanner does. */
  beep?: boolean;
  className?: string;
};

/**
 * Live camera preview that reports decoded ticket codes.
 *
 * Deliberately knows nothing about tickets, occurrences or festivals: it reads
 * a code and hands the string over. Both the programs door screen and the
 * festival verification desk mount it, and neither can teach it anything about
 * their own validation rules.
 *
 * The camera is started once and left running — including while a result is
 * being verified. Tearing it down per scan costs a permission-free but visibly
 * slow re-acquisition on phones, which at a door reads as the app being broken.
 *
 * ZXing is imported lazily inside the effect for two reasons: it touches
 * browser APIs that do not exist during the server pre-render of this client
 * component, and it is large enough that no page which never opens the camera
 * should pay for it.
 */
export default function CodeScanner({
  onScan,
  busy = false,
  busyLabel = "Verificando…",
  onClose,
  formats = DEFAULT_FORMATS,
  cooldownMs = DEFAULT_COOLDOWN_MS,
  beep = true,
  className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  /**
   * Read inside the decode callback, which ZXing registers once. Props captured
   * by that closure would be frozen at their first value, so they live in refs.
   */
  const busyRef = useRef(busy);
  const beepRef = useRef(beep);
  const cooldownRef = useRef(cooldownMs);
  const onScanRef = useRef(onScan);
  const formatsRef = useRef(formats);
  const lastRef = useRef<{ code: string; at: number } | null>(null);

  useEffect(() => {
    busyRef.current = busy;
    beepRef.current = beep;
    cooldownRef.current = cooldownMs;
    onScanRef.current = onScan;
    formatsRef.current = formats;
  });

  /**
   * The effect must not re-run on every render — restarting the camera mid-scan
   * is the one thing this component cannot do — but a caller that genuinely
   * changes symbologies deserves a reader that respects it. Keying on the
   * joined list gives both: an inline `["qr_code"]` array is a new object each
   * render yet the same key, so only a real change restarts the reader.
   */
  const formatKey = formats.join(",");

  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | null = null;

    async function start() {
      try {
        const [
          { BrowserMultiFormatReader },
          { BarcodeFormat, DecodeHintType },
        ] = await Promise.all([
          import("@zxing/browser"),
          import("@zxing/library"),
        ]);
        // Unmounted while the chunks were loading: never touch the camera.
        if (cancelled || !videoRef.current) return;

        const zxingFormats: Record<ScanFormat, number> = {
          qr_code: BarcodeFormat.QR_CODE,
          code_128: BarcodeFormat.CODE_128,
          code_39: BarcodeFormat.CODE_39,
          ean_13: BarcodeFormat.EAN_13,
        };

        /**
         * Without this hint the reader attempts every symbology it knows on
         * every frame, which on a mid-range phone is the difference between a
         * scan that lands immediately and one the operator has to hold still
         * for.
         */
        const hints = new Map();
        hints.set(
          DecodeHintType.POSSIBLE_FORMATS,
          formatsRef.current.map((format) => zxingFormats[format]),
        );

        const reader = new BrowserMultiFormatReader(hints);
        const scannerControls = await reader.decodeFromVideoDevice(
          // Undefined asks for `facingMode: environment` — the rear camera,
          // which is the one pointed at a phone screen being presented.
          undefined,
          videoRef.current,
          (result) => {
            if (!result || busyRef.current) return;

            const code = result.getText();
            const now = Date.now();
            const last = lastRef.current;

            /**
             * A code sits in frame for seconds and decodes on every video
             * frame. Without this the first presentation fires dozens of
             * identical check-ins, each answered "ya fue usada" — the correct
             * record, but a screen the operator cannot read past.
             */
            if (
              last &&
              last.code === code &&
              now - last.at < cooldownRef.current
            ) {
              return;
            }

            lastRef.current = { code, at: now };
            if (beepRef.current) playScanBeep();
            onScanRef.current(code);
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
  }, [formatKey]);

  if (error) {
    return (
      <div className="relative rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 pr-11 text-sm text-amber-900">
        {error}
        {onClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1 h-8 w-8 text-amber-900 hover:bg-amber-200 hover:text-amber-900"
            onClick={onClose}
            aria-label="Cerrar la cámara"
          >
            <XIcon className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-black",
        className,
      )}
    >
      {/* `playsInline` and `muted` are what stop iOS Safari from taking the
          preview fullscreen and from refusing to autoplay it. */}
      <video
        ref={videoRef}
        className="aspect-square w-full object-cover"
        playsInline
        muted
      />

      {onClose ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          // Sits above the busy overlay: closing has to stay reachable even
          // while a scan is being verified, or a stuck request traps the camera.
          className="absolute right-2 top-2 z-10 h-9 w-9 rounded-full bg-black/60 text-white hover:bg-black/80 hover:text-white"
          onClick={onClose}
          aria-label="Cerrar la cámara"
        >
          <XIcon className="h-5 w-5" />
        </Button>
      ) : null}

      {!ready ? (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
          Abriendo la cámara…
        </p>
      ) : null}

      {busy ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60"
          role="status"
          aria-live="polite"
        >
          <Loader2Icon className="h-8 w-8 animate-spin text-white" />
          <p className="text-sm font-medium text-white">{busyLabel}</p>
        </div>
      ) : null}
    </div>
  );
}
