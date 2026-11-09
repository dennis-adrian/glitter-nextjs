"use client";

import { useEffect } from "react";

import {
  isStaleDeploymentError,
  toastStaleDeployment,
} from "@/app/lib/errors/action-error";

/**
 * An action awaited outside any try — an `onClick={async () => …}`, a
 * react-hook-form submit — rejects with nobody listening, so in a tab left open
 * across a deploy the button just stops answering. This says why.
 */
export default function StaleDeploymentListener() {
  useEffect(() => {
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      if (isStaleDeploymentError(event.reason)) toastStaleDeployment();
    }
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () =>
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
  }, []);

  return null;
}
