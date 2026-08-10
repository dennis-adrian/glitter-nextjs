"use client";

import { CameraIcon, CameraOffIcon } from "lucide-react";

import { Button } from "@/app/components/ui/button";
import { primeScannerAudio } from "@/app/lib/scanner/beep";
import { cn } from "@/app/lib/utils";

type Props = {
  open: boolean;
  onToggle: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * The control that opens and closes the camera, sat next to the code input.
 *
 * A component of its own rather than a bare `<Button>` at each call site
 * because of `primeScannerAudio`: the tap that opens the camera is the only
 * user gesture reliably available before the first scan, and iOS will not let
 * us make a sound later without one. Every screen that opens a scanner has to
 * spend that gesture, and that is far too easy to forget at a call site.
 */
export default function CodeScannerToggle({
  open,
  onToggle,
  disabled,
  className,
}: Props) {
  return (
    <Button
      type="button"
      variant={open ? "secondary" : "outline"}
      size="icon"
      disabled={disabled}
      className={cn("shrink-0", className)}
      aria-pressed={open}
      aria-label={open ? "Cerrar la cámara" : "Escanear con la cámara"}
      title={open ? "Cerrar la cámara" : "Escanear con la cámara"}
      onClick={() => {
        if (!open) {
          primeScannerAudio();
          // The code input is usually focused when this is tapped, and on a
          // phone its keyboard occupies the half of the screen the camera is
          // about to appear in.
          (document.activeElement as HTMLElement | null)?.blur();
        }
        onToggle(!open);
      }}
    >
      {open ? (
        <CameraOffIcon className="h-5 w-5" />
      ) : (
        <CameraIcon className="h-5 w-5" />
      )}
    </Button>
  );
}
