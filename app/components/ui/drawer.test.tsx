import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/app/components/ui/drawer";

function InfoDrawer() {
  return (
    <Drawer>
      <DrawerTrigger>Qué es Cobrado</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Cobrado</DrawerTitle>
          <DrawerDescription>Lo que ya entró.</DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <DrawerClose>Entendido</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

const platform = Object.getOwnPropertyDescriptor(
  Navigator.prototype,
  "platform",
);

describe("Drawer on an iPhone, with the page scrolled", () => {
  let scrollTo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // vaul takes the iOS path from the platform, as on the owner's phone.
    Object.defineProperty(Navigator.prototype, "platform", {
      configurable: true,
      get: () => "iPhone",
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(window, "pageYOffset", {
      configurable: true,
      value: 300,
    });
    scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    // The installed app, as on the owner's phone.
    vi.stubGlobal(
      "matchMedia",
      (query: string) =>
        ({
          matches: query.includes("standalone"),
          media: query,
          onchange: null,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    // jsdom has no pointer capture; vaul asks for it on every press.
    Element.prototype.setPointerCapture ??= () => {};
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.hasPointerCapture ??= () => false;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    if (platform) Object.defineProperty(Navigator.prototype, "platform", platform);
    Reflect.deleteProperty(window, "scrollY");
    Reflect.deleteProperty(window, "pageYOffset");
  });

  it("leaves the page where it was when it opens", async () => {
    render(<InfoDrawer />);
    fireEvent.click(screen.getByText("Qué es Cobrado"));
    await screen.findByRole("dialog");

    // vaul's own iOS lock scrolled the window to the top here, with nothing
    // to hide it: the page jumped under the drawer.
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("closes from its own button without moving the page mid-tap", async () => {
    render(<InfoDrawer />);
    fireEvent.click(screen.getByText("Qué es Cobrado"));
    await screen.findByRole("dialog");

    const close = screen.getByText("Entendido");
    // A finger on the button: vaul starts tracking a drag. Its lock used to
    // switch off here (scrolling the page back) and on again on release
    // (to the top), and iOS dropped the tap as a scroll.
    fireEvent.pointerDown(close, { pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(close, { pointerId: 1, pointerType: "touch" });
    fireEvent.click(close);

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { hidden: true })?.getAttribute(
          "data-state",
        ) ?? "closed",
      ).toBe("closed"),
    );
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("still lets a caller turn vaul's own lock back on", async () => {
    render(
      <Drawer disablePreventScroll>
        <DrawerTrigger>Abrir</DrawerTrigger>
        <DrawerContent>
          <DrawerTitle>Con bloqueo</DrawerTitle>
          <DrawerDescription>Texto</DrawerDescription>
        </DrawerContent>
      </Drawer>,
    );
    fireEvent.click(screen.getByText("Abrir"));
    await screen.findByRole("dialog");
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
  });
});
