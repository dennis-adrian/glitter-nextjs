"use client";

import { useAuth } from "@clerk/nextjs";
import { EyeIcon, LoaderCircleIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  endView,
  setViewState,
  useViewState,
  type ViewState,
} from "@/app/components/impersonation/view-state";
import { getUserName } from "@/app/lib/users/utils";

const STATE_URL = "/api/impersonation";
/** Where Salir lands when the server could not say. */
const FALLBACK_RETURN = "/dashboard";

async function fetchViewState(): Promise<ViewState | "unknown"> {
  try {
    const response = await fetch(STATE_URL, { cache: "no-store" });
    if (!response.ok) return "unknown";
    const body = (await response.json()) as
      | { active: false }
      | {
          active: true;
          secondsLeft: number;
          subject: NonNullable<ViewState>["subject"];
        };
    return body.active
      ? { subject: body.subject, secondsLeft: body.secondsLeft }
      : null;
  } catch {
    return "unknown";
  }
}

/**
 * Publishes the banner's height for whatever sits below the sticky navbar
 * (store subheaders, sticky program tabs, the dashboard's viewport-tall
 * frame), next to the announcement strip's.
 */
function usePublishedHeight(
  ref: React.RefObject<HTMLElement | null>,
  on: boolean,
) {
  useEffect(() => {
    const element = ref.current;
    if (!on || !element) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty(
        "--impersonation-banner-height",
        `${element.getBoundingClientRect().height}px`,
      );
    const observer = new ResizeObserver(update);
    observer.observe(element);
    update();
    return () => {
      observer.disconnect();
      root.style.removeProperty("--impersonation-banner-height");
    };
  }, [ref, on]);
}

/**
 * The banner of "Entrar como participante" (docs/PLAN-impersonation.md §7.4):
 * on every page of a view, above the announcement strip, the installed
 * app's top bar and the header, so it never scrolls away. It says whose app
 * this is and that nothing is saved, and Salir takes the admin back to
 * their own account with one tap.
 *
 * `initial` is the server's answer. A page rendered without a request (the
 * `force-static` program pages) cannot know, so there `probe` asks the
 * server once, and only for someone signed in.
 */
export default function ImpersonationBanner({
  initial,
  probe = false,
}: {
  initial: ViewState;
  probe?: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const stored = useViewState();
  // The server's answer until the store has it, so the banner is in the
  // first HTML rather than appearing once the page hydrates.
  const view = stored ?? initial;
  const [ended, setEnded] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLElement>(null);
  // Who the banner speaks of: kept once the view ends, to say whose ended.
  const [shown, setShown] = useState<NonNullable<ViewState> | null>(initial);

  // `initial` only changes with a whole new document (entering and leaving
  // a view both load one), so `shown` starts from it and the store follows.
  useEffect(() => {
    setViewState(initial);
  }, [initial]);

  useEffect(() => {
    if (!probe || initial || !isLoaded || !isSignedIn) return;
    let active = true;
    void fetchViewState().then((state) => {
      if (!active || state === "unknown" || !state) return;
      setViewState(state);
      setShown(state);
    });
    return () => {
      active = false;
    };
  }, [probe, initial, isLoaded, isSignedIn]);

  // The hour runs out on its own: the banner says so when it does.
  useEffect(() => {
    if (!view || ended) return;
    const timer = window.setTimeout(
      () => setEnded(true),
      Math.max(0, view.secondsLeft) * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [view, ended]);

  // Back on the tab after a while, or after Salir in another tab: ask again.
  useEffect(() => {
    if (!view || ended) return;
    const recheck = () => {
      if (document.visibilityState !== "visible") return;
      void fetchViewState().then((state) => {
        if (state === null) setEnded(true);
      });
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [view, ended]);

  const visible = shown != null && (view != null || ended);

  usePublishedHeight(ref, visible);

  const leave = useCallback(async () => {
    setLeaving(true);
    setError(false);
    const returnTo = await endView("exited");
    if (returnTo == null) {
      setLeaving(false);
      setError(true);
      return;
    }
    setViewState(null);
    // A whole new document: nothing kept in memory for the participant (the
    // navbar's profile, cached prices) outlives the view.
    window.location.replace(returnTo || FALLBACK_RETURN);
  }, []);

  if (!visible || !shown) return null;

  const name = getUserName(shown.subject) || shown.subject.email;

  return (
    <section
      ref={ref}
      data-impersonation-banner=""
      aria-label="Vista como participante"
      className="border-b border-brand-coral/40 bg-brand-coral-soft text-brand-ink standalone:pt-[env(safe-area-inset-top)]"
    >
      <div className="mx-auto flex min-h-12 w-full max-w-[1440px] items-center gap-3 px-4 py-1.5 sm:px-8 lg:px-12 xl:px-20">
        <EyeIcon aria-hidden="true" className="size-5 shrink-0" />
        <p className="min-w-0 flex-1 text-sm" aria-live="polite">
          {ended ? (
            <span className="block truncate">
              La vista como <strong className="font-semibold">{name}</strong>{" "}
              terminó
            </span>
          ) : (
            <span className="flex min-w-0 items-baseline gap-x-2">
              <span className="truncate">
                Estás viendo como{" "}
                <strong className="font-semibold">{name}</strong>
                <span className="hidden text-brand-ink/70 lg:inline">
                  {" "}
                  · {shown.subject.email}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-brand-ink/10 px-2 py-0.5 text-xs font-medium">
                solo lectura
              </span>
            </span>
          )}
          {error ? (
            <span role="alert" className="block text-xs">
              No se pudo salir. Intentá de nuevo.
            </span>
          ) : null}
        </p>
        <button
          type="button"
          onClick={leave}
          disabled={leaving}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-brand-ink px-5 text-sm font-semibold text-brand-elevated transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-ink disabled:opacity-70"
        >
          {leaving ? (
            <LoaderCircleIcon
              aria-hidden="true"
              className="size-4 animate-spin"
            />
          ) : null}
          {ended ? "Volver a mi cuenta" : "Salir"}
        </button>
      </div>
    </section>
  );
}
