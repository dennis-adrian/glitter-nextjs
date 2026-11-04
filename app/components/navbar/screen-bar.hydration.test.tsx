import { act } from "@testing-library/react";
import { lazy, Suspense } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/store/products/demo-merch-pin",
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}));

import {
  AppScreenBar,
  ScreenBarProvider,
  ScreenTitle,
} from "@/app/components/navbar/screen-bar";
import type { Screen } from "@/app/components/navbar/screens";

/**
 * The navbar hydrates in a Suspense boundary of its own, after the page: the
 * page's `ScreenTitle` has already set its title by then. The bar's first
 * browser render must still match the server HTML, then show the page's
 * title.
 */

const screen: Screen = {
  title: "Producto",
  parentHref: "/merch",
  close: false,
  toParent: false,
};

function Bar() {
  return <AppScreenBar screen={screen} />;
}

function App({ BarComponent }: { BarComponent: typeof Bar }) {
  return (
    <ScreenBarProvider>
      <Suspense fallback={<div>cargando</div>}>
        <BarComponent />
      </Suspense>
      <main>
        <ScreenTitle title="Pin Estrellita" />
      </main>
    </ScreenBarProvider>
  );
}

let container: HTMLDivElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
});

describe("the installed app's top bar while the page hydrates", () => {
  it("matches the server HTML, then shows the page's own title", async () => {
    const html = renderToString(<App BarComponent={Bar} />);
    expect(html).toContain("Producto");

    container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);

    // The bar's boundary hydrates after the page, as the navbar's does.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const LateBar = lazy(async () => {
      await gate;
      return { default: Bar };
    });

    const recoverable: unknown[] = [];
    await act(async () => {
      hydrateRoot(container!, <App BarComponent={LateBar} />, {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });
    await act(async () => {
      release();
      await gate;
    });

    expect(recoverable).toEqual([]);
    expect(container.querySelector("[data-screen-bar] p")?.textContent).toBe(
      "Pin Estrellita",
    );
  });
});
