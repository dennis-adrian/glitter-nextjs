import * as React from "react";

let openOverlayCount = 0;

function restoreBodyPointerEvents() {
  document.body.style.removeProperty("pointer-events");
}

/** Register an open Dialog, AlertDialog, or Drawer overlay. */
export function acquireOverlay() {
  openOverlayCount += 1;
}

/**
 * Unregister an overlay. Restores body pointer-events only when no
 * Dialog, AlertDialog, or Drawer remains open.
 */
export function releaseOverlay() {
  openOverlayCount = Math.max(0, openOverlayCount - 1);
  if (openOverlayCount === 0) {
    restoreBodyPointerEvents();
  }
}

/** Track overlay open state and coordinate body pointer-events cleanup. */
export function useOverlayOwnership(open: boolean) {
  React.useEffect(() => {
    if (!open) return;
    acquireOverlay();
    return () => {
      releaseOverlay();
    };
  }, [open]);
}
