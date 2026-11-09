import { type ExternalToast, toast } from "sonner";

export const STALE_DEPLOYMENT_MESSAGE =
  "Hay una nueva versión de la app. Recargá la página para continuar.";

/**
 * What Next answers an unknown (409) or malformed (400) action ID with. The
 * client only throws these bodies as a plain Error when the
 * `x-nextjs-action-not-found` marker did not make it back — a proxy dropping
 * headers it does not know — so they are the fallback, not the usual case.
 */
const UNRECOGNIZED_ACTION_BODIES = new Set([
  "Server Action unavailable.",
  "Invalid Server Action request.",
]);

/**
 * True when an action call failed because this tab runs a build the server no
 * longer has. Action IDs change between deploys, so a tab left open across one
 * calls IDs the new server does not know. Every action from that tab fails the
 * same way until the page reloads, which makes "intentá de nuevo" a dead end,
 * and Next's own message for it ("Server Action … was not found on the
 * server") is English.
 *
 * Matched by name rather than with `next/navigation`'s
 * `unstable_isUnrecognizedActionError`: importing that module here would make
 * every test that mocks `next/navigation` for `useRouter` also have to mock it.
 */
export function isStaleDeploymentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "UnrecognizedActionError" ||
    UNRECOGNIZED_ACTION_BODIES.has(error.message)
  );
}

/** `message`, unless the failure was a stale deployment. */
export function actionErrorMessage(error: unknown, message: string): string {
  return isStaleDeploymentError(error) ? STALE_DEPLOYMENT_MESSAGE : message;
}

/**
 * One id so a burst of failing actions shows a single notice, and no timeout
 * because nothing the person does short of reloading will clear it.
 */
const STALE_DEPLOYMENT_TOAST_ID = "stale-deployment";

export function toastStaleDeployment(
  position?: ExternalToast["position"],
): void {
  toast.error(STALE_DEPLOYMENT_MESSAGE, {
    id: STALE_DEPLOYMENT_TOAST_ID,
    duration: Infinity,
    position,
    action: { label: "Recargar", onClick: () => window.location.reload() },
  });
}

/**
 * `toast.error(...args)` for a caught action failure, with the reload notice in
 * its place when the tab is stale. Anything else is passed through untouched.
 */
export function toastActionError(
  error: unknown,
  ...args: Parameters<typeof toast.error>
): void {
  if (isStaleDeploymentError(error)) {
    toastStaleDeployment(args[1]?.position);
    return;
  }
  toast.error(...args);
}
