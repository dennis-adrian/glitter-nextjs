import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Clerk's <SignIn> and <SignUp> render their mount point only once
 * `clerk.loaded`, a getter on the Clerk singleton that they read during
 * render. The server never has clerk-js, so it always sees `false`; a browser
 * that finished loading clerk-js before the page hydrated sees `true`, renders
 * a node the server never sent, and React throws #418. This flag stands in for
 * that getter, so each case picks which side of the race the browser is on.
 */
const clerk = vi.hoisted(() => ({ loaded: false }));

/**
 * Same render shape as @clerk/react 6.4.x: the fallback while Clerk has not
 * mounted its card (it never does here), plus the mount point once loaded,
 * hidden while a fallback shows.
 */
vi.mock("@clerk/nextjs", () => {
  function clerkComponent(component: string) {
    return function ClerkComponent({ fallback }: { fallback?: ReactNode }) {
      return (
        <>
          {fallback}
          {clerk.loaded && (
            <div
              data-clerk-component={component}
              style={fallback ? { display: "none" } : undefined}
            />
          )}
        </>
      );
    };
  }

  return { SignIn: clerkComponent("SignIn"), SignUp: clerkComponent("SignUp") };
});

import SignInPage from "@/app/sign_in/[[...sign_in]]/page";
import SignUpPage from "@/app/sign_up/[[...sign_up]]/page";

let root: Root | undefined;
let serverHtmlHost: HTMLElement | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  serverHtmlHost?.remove();
  serverHtmlHost = undefined;
  cleanup();
  clerk.loaded = false;
  vi.restoreAllMocks();
});

/** Renders `page` the way the server does: clerk-js is never loaded there. */
function renderOnServer(page: ReactNode) {
  clerk.loaded = false;
  const html = renderToString(page);

  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  serverHtmlHost = host;

  return { html, host };
}

describe.each([
  { route: "/sign_in", Page: SignInPage, component: "SignIn" },
  { route: "/sign_up", Page: SignUpPage, component: "SignUp" },
])("$route", ({ Page, component }) => {
  const mountPoint = `[data-clerk-component="${component}"]`;

  it.each([
    { loadedBeforeHydration: false },
    { loadedBeforeHydration: true },
  ])(
    "hydrates without a mismatch when loadedBeforeHydration=$loadedBeforeHydration",
    async ({ loadedBeforeHydration }) => {
      const page = await Page();
      const { html, host } = renderOnServer(page);
      expect(html).not.toContain("data-clerk-component");

      clerk.loaded = loadedBeforeHydration;
      const onRecoverableError = vi.fn();
      const consoleError = vi.spyOn(console, "error");
      await act(async () => {
        root = hydrateRoot(host, page, { onRecoverableError });
      });

      // React 19 reports a mismatch here (error #418 in production) and then
      // client-renders; console.error catches any dev warning around it.
      expect(onRecoverableError).not.toHaveBeenCalled();
      expect(consoleError).not.toHaveBeenCalled();
      // Once hydration is over the form renders, as soon as Clerk is ready.
      expect(host.querySelector(mountPoint) !== null).toBe(
        loadedBeforeHydration,
      );
    },
  );

  it("shows the skeleton from the first HTML until Clerk mounts its card", async () => {
    const page = await Page();
    const { html, host } = renderOnServer(page);
    expect(html).toContain("animate-pulse");

    clerk.loaded = true;
    await act(async () => {
      root = hydrateRoot(host, page, { onRecoverableError: vi.fn() });
    });

    expect(host.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("renders the form straight away after a client-side navigation", async () => {
    clerk.loaded = true;
    const { container } = render(await Page());

    expect(container.querySelector(mountPoint)).not.toBeNull();
  });
});
