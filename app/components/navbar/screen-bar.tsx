"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { ChevronLeftIcon, XIcon } from "lucide-react";

import {
  hasScreenBehind,
  historyOnLoad,
  markNextAsReplace,
  nextHistory,
  readHistory,
  takeReplaceMark,
  writeHistory,
} from "@/app/components/navbar/screen-history";
import type { Screen, ScreenContext } from "@/app/components/navbar/screens";
import { useHydrated } from "@/app/hooks/use-hydrated";
import { cn } from "@/app/lib/utils";

/**
 * What a page tells the installed app's top bar about itself: a title that
 * depends on its data, a parent the path alone cannot give, a back that has
 * to do something first (free a held stand), or the one action on the right.
 * Each value is kept with the path it was set on, so a screen never shows
 * the previous one's title while it loads.
 */
type Overrides = {
  title?: { path: string; value: string };
  backHref?: { path: string; value: string };
  onBack?: { path: string; value: () => void };
  action?: { path: string; value: React.ReactNode };
  /** This page is the named tab's own page, so no bar (see ScreenRoot). */
  root?: { path: string; value: string };
};

/**
 * Sets a value, or with `undefined` clears it, but only while `owner` is
 * still the value there: the next screen may have set its own already.
 */
type Setter = <K extends keyof Overrides>(
  key: K,
  value: Overrides[K] | undefined,
  owner?: Overrides[K],
) => void;

const OverridesContext = createContext<Overrides>({});
const SetterContext = createContext<Setter>(() => {});
/**
 * Who is viewing and their tabs, as the navbar resolved them, for the
 * breadcrumbs inside the page. Null until the navbar has streamed in.
 */
const NavContext = createContext<ScreenContext | null>(null);
const NavSetterContext = createContext<(ctx: ScreenContext) => void>(() => {});

/** Follows, for this tab, the screens moved through inside the app. */
function useScreenHistory() {
  const pathname = usePathname() ?? "/";
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      writeHistory(historyOnLoad(readHistory(), pathname));
      return;
    }
    writeHistory(
      nextHistory(readHistory(), pathname, { replace: takeReplaceMark() }),
    );
  }, [pathname]);
}

/** Wraps the navbar and the page, so a page can speak to the bar above it. */
export function ScreenBarProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [nav, setNav] = useState<ScreenContext | null>(null);
  const set = useCallback<Setter>((key, value, owner) => {
    setOverrides((current) => {
      if (current[key] === value) return current;
      if (
        value === undefined &&
        owner !== undefined &&
        current[key] !== owner
      ) {
        return current;
      }
      const next = { ...current };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }, []);
  useScreenHistory();

  return (
    <SetterContext.Provider value={set}>
      <NavSetterContext.Provider value={setNav}>
        <OverridesContext.Provider value={overrides}>
          <NavContext.Provider value={nav}>{children}</NavContext.Provider>
        </OverridesContext.Provider>
      </NavSetterContext.Provider>
    </SetterContext.Provider>
  );
}

const NO_OVERRIDES: Overrides = {};

/**
 * The page's overrides, as this reader may use them. None until the reader
 * has hydrated: a page sets its title in a layout effect as soon as it
 * hydrates, and the navbar, in a Suspense boundary of its own, can hydrate
 * after it. Read at once, the navbar's first browser render would show the
 * page's title ("Pin Estrellita") over the server's ("Producto") and React
 * would throw the tree away. Read after, the first paint matches the server
 * HTML and the page's title takes over one render later.
 */
function usePageOverrides(): Overrides {
  const overrides = useContext(OverridesContext);
  return useHydrated() ? overrides : NO_OVERRIDES;
}

/** Sets one value for the current path while the caller is on screen. */
function useOverride<K extends keyof Overrides>(
  key: K,
  value: NonNullable<Overrides[K]>["value"] | undefined,
) {
  const set = useContext(SetterContext);
  const path = usePathname() ?? "/";
  useLayoutEffect(() => {
    if (value === undefined) return;
    const entry = { path, value } as Overrides[K];
    set(key, entry);
    return () => set(key, undefined, entry);
  }, [key, path, set, value]);
}

/**
 * Names the screen in the installed app's top bar, for titles that depend on
 * the page's data (a product, an order number). Renders nothing.
 */
export function ScreenTitle({
  title,
  backHref,
}: {
  title?: string;
  /** Where back leads when there is no previous screen in the app. */
  backHref?: string;
}) {
  useOverride("title", title);
  useOverride("backHref", backHref);
  return null;
}

/**
 * Makes the top bar's back run `handler` instead of leaving, for screens
 * where leaving must do something first, like freeing a held stand. Pass a
 * stable function (wrap it in `useCallback`).
 */
export function useScreenBack(handler: (() => void) | undefined) {
  useOverride("onBack", handler);
}

/**
 * Marks the page as a tab's own page when the navbar could not tell, like
 * the festival in progress: the navbar learns which festival that is on the
 * first page it renders, and a static first page (or a festival activated
 * since) leaves it guessing. Only takes effect for viewers who have `tab`.
 */
export function ScreenRoot({ tab }: { tab: string }) {
  useOverride("root", tab);
  return null;
}

/** The tab the current page says it is the own page of, if any. */
export function useScreenRootMark(): string | undefined {
  const overrides = usePageOverrides();
  const path = usePathname() ?? "/";
  return current(overrides.root, path);
}

/** The one action on the right of the top bar, like the cart. */
export function ScreenAction({ children }: { children: React.ReactNode }) {
  useOverride("action", children);
  return null;
}

/** Shares the navbar's view of who is viewing with the page's breadcrumbs. */
export function usePublishScreenContext(ctx: ScreenContext) {
  const publish = useContext(NavSetterContext);
  // Republished only when something that places a screen changes.
  const key = JSON.stringify([
    ctx.viewer,
    ctx.tabs.map((tab) => [
      tab.key,
      tab.label,
      tab.href,
      tab.children?.map((child) => [child.label, child.href]),
    ]),
    ctx.activeFestival?.id ?? null,
  ]);
  const published = useRef<string | null>(null);
  // Runs after every render but publishes only when the key changed.
  useEffect(() => {
    if (published.current === key) return;
    published.current = key;
    publish(ctx);
  });
}

/** The navbar's view of who is viewing, and the page's own title, if set. */
export function useScreenPlacement() {
  const nav = useContext(NavContext);
  const overrides = usePageOverrides();
  const path = usePathname() ?? "/";
  const rootTab = current(overrides.root, path);
  const isRoot = Boolean(
    rootTab && nav?.tabs.some((tab) => tab.key === rootTab),
  );
  return {
    nav,
    path,
    title: current(overrides.title, path),
    parentHref: current(overrides.backHref, path),
    isRoot,
  };
}

function current<T>(
  entry: { path: string; value: T } | undefined,
  path: string,
) {
  return entry && entry.path === path ? entry.value : undefined;
}

/**
 * Whether the screen before this one is a screen of the app. The Navigation
 * API answers exactly where it exists (Chromium, Safari 26); elsewhere, the
 * screens this tab moved through (screen-history.ts) are the best sign.
 */
function hasPreviousScreen(): boolean {
  if (typeof window === "undefined") return false;
  const navigation = (
    window as unknown as {
      navigation?: {
        currentEntry?: { index: number } | null;
        entries?: () => { url: string | null }[];
      };
    }
  ).navigation;
  if (navigation?.currentEntry && typeof navigation.entries === "function") {
    const index = navigation.currentEntry.index;
    if (index <= 0) return false;
    const previous = navigation.entries()[index - 1]?.url;
    if (!previous) return false;
    try {
      const url = new URL(previous);
      return (
        url.origin === window.location.origin &&
        !/\/sign_(in|up)(\/|$)/.test(url.pathname)
      );
    } catch {
      return false;
    }
  }
  return hasScreenBehind(readHistory());
}

/** What the bar shows and does for this screen, with the page's overrides. */
function useScreenBar(screen: Screen) {
  const router = useRouter();
  const path = usePathname() ?? "/";
  const overrides = usePageOverrides();
  const title = current(overrides.title, path) ?? screen.title;
  const parentHref = current(overrides.backHref, path) ?? screen.parentHref;
  const onBack = current(overrides.onBack, path);
  const action = current(overrides.action, path);

  const back = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
    if (!screen.toParent && hasPreviousScreen()) {
      router.back();
      return;
    }
    // Replacing keeps Android's system back from returning to this screen.
    markNextAsReplace();
    router.replace(parentHref);
  }, [onBack, parentHref, router, screen.toParent]);

  return useMemo(
    () => ({ title, action, back, close: screen.close }),
    [action, back, screen.close, title],
  );
}

function BackButton({
  close,
  onClick,
  className,
}: {
  close: boolean;
  onClick: () => void;
  className?: string;
}) {
  const Icon = close ? XIcon : ChevronLeftIcon;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={close ? "Cerrar" : "Volver"}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-brand-ink transition-colors hover:bg-brand-lavender focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
        className,
      )}
    >
      <Icon className="size-6" aria-hidden="true" />
    </button>
  );
}

/**
 * The installed app's bar on a phone, on every screen below a tab root: back
 * (or an X on a flow's first step), the title centred, and at most one
 * action. It takes the header's place and height, so nothing below moves.
 * Only standalone display mode below the desktop breakpoint shows it, by CSS,
 * like the tab bar.
 */
export function AppScreenBar({ screen }: { screen: Screen }) {
  const { title, action, back, close } = useScreenBar(screen);
  return (
    <div
      data-screen-bar=""
      className="hidden h-[calc(76px+env(safe-area-inset-top))] grid-cols-[3.5rem_minmax(0,1fr)_3.5rem] items-center border-b border-brand-border bg-brand-elevated/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur standalone:max-lg:grid"
    >
      <BackButton close={close} onClick={back} />
      <p className="truncate text-center text-[17px] font-semibold text-brand-ink">
        {title}
      </p>
      <div className="flex justify-end">{action}</div>
    </div>
  );
}

/**
 * The same back and title for the installed app on a desktop, inside the
 * header, which keeps the bell and the account there: Chrome and Edge show
 * no back button of their own in an installed app's window.
 */
export function ScreenHeaderBack({ screen }: { screen: Screen }) {
  const { title, action, back, close } = useScreenBar(screen);
  return (
    <div className="hidden min-w-0 items-center gap-2 standalone:lg:flex">
      <BackButton close={close} onClick={back} />
      <p className="truncate font-display text-xl font-semibold text-brand-ink">
        {title}
      </p>
      {action ? <div className="ml-2 shrink-0">{action}</div> : null}
    </div>
  );
}
