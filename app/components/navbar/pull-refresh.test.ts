import { afterEach, describe, expect, it } from "vitest";

import {
  canStartPull,
  isReadyToRefresh,
  PULL_MAX,
  PULL_THRESHOLD,
  pullDistance,
  pullProgress,
} from "@/app/components/navbar/pull-refresh";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the pull's numbers", () => {
  it("follows the finger at half speed, up to a limit", () => {
    expect(pullDistance(-20)).toBe(0);
    expect(pullDistance(40)).toBe(20);
    expect(pullDistance(1000)).toBe(PULL_MAX);
  });

  it("fills the ring up to the threshold, which is where release refreshes", () => {
    expect(pullProgress(PULL_THRESHOLD / 2)).toBe(0.5);
    expect(pullProgress(PULL_MAX)).toBe(1);
    expect(isReadyToRefresh(PULL_THRESHOLD - 1)).toBe(false);
    expect(isReadyToRefresh(PULL_THRESHOLD)).toBe(true);
  });
});

describe("canStartPull", () => {
  function place(html: string) {
    document.body.innerHTML = html;
    return document.getElementById("target");
  }

  it("starts on the page itself", () => {
    expect(
      canStartPull(place('<main><p id="target">Hola</p></main>'), document),
    ).toBe(true);
  });

  it("never starts while a dialog or sheet is open", () => {
    const target = place(
      '<main><p id="target">Hola</p></main><div role="dialog" data-state="open"></div>',
    );
    expect(canStartPull(target, document)).toBe(false);
  });

  it("never starts behind a confirmation, a menu or a locked page", () => {
    const target = () => document.getElementById("target");
    place(
      '<p id="target">Hola</p><div role="alertdialog" data-state="open"></div>',
    );
    expect(canStartPull(target(), document)).toBe(false);
    place(
      '<p id="target">Hola</p><div data-radix-popper-content-wrapper></div>',
    );
    expect(canStartPull(target(), document)).toBe(false);
    place('<p id="target">Hola</p>');
    document.body.setAttribute("data-scroll-locked", "1");
    expect(canStartPull(target(), document)).toBe(false);
    document.body.removeAttribute("data-scroll-locked");
  });

  it("never starts behind a drawer, open or still sliding away", () => {
    const target = () => document.getElementById("target");
    // vaul's content as it renders: a Radix dialog marked as a drawer.
    place(
      '<main><p id="target">Hola</p></main><div role="dialog" data-state="open" data-vaul-drawer data-vaul-drawer-direction="bottom"></div>',
    );
    expect(canStartPull(target(), document)).toBe(false);
    place(
      '<main><p id="target">Hola</p></main><div role="dialog" data-state="closed" data-vaul-drawer></div>',
    );
    expect(canStartPull(target(), document)).toBe(false);
  });

  it("never starts while a drawer pins the body at its scroll offset", () => {
    const target = place('<main><p id="target">Hola</p></main>');
    document.body.style.setProperty("position", "fixed", "important");
    document.body.style.top = "-300px";
    expect(canStartPull(target, document)).toBe(false);
    document.body.removeAttribute("style");
    expect(canStartPull(target, document)).toBe(true);
  });

  it("never starts on a map or a pinch-zoom viewer", () => {
    expect(
      canStartPull(
        place('<svg data-no-pull-refresh><g id="target"></g></svg>'),
        document,
      ),
    ).toBe(false);
    expect(
      canStartPull(
        place('<div class="react-transform-wrapper"><img id="target" /></div>'),
        document,
      ),
    ).toBe(false);
  });

  it("never starts inside a box that can still scroll up", () => {
    const target = place(
      '<div id="box" style="overflow-y: auto; height: 50px"><p id="target">Hola</p></div>',
    );
    const box = document.getElementById("box")!;
    Object.defineProperty(box, "scrollHeight", { value: 400 });
    Object.defineProperty(box, "clientHeight", { value: 50 });
    box.scrollTop = 30;
    expect(canStartPull(target, document)).toBe(false);
  });
});
