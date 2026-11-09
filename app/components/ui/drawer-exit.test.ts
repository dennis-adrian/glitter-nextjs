import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DRAWER_EXIT_EASING,
  DRAWER_EXIT_MS,
  leaveExitGhost,
  onDrawerPartDetach,
} from "@/app/components/ui/drawer-exit";

type Call = { element: Element; keyframes: Keyframe[]; options: unknown };

let calls: Call[];
let finish: () => void;

beforeEach(() => {
  calls = [];
  let resolve: () => void = () => {};
  const finished = new Promise<void>((done) => {
    resolve = done;
  });
  finish = resolve;
  // jsdom has no Web Animations.
  HTMLElement.prototype.animate = function (keyframes, options) {
    calls.push({ element: this, keyframes: keyframes as Keyframe[], options });
    return { finished } as unknown as Animation;
  };
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
  }));
});

afterEach(() => {
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function drawer(direction = "bottom") {
  document.body.innerHTML = `
    <div id="overlay" data-vaul-overlay data-slot="drawer-overlay" data-state="closed" style="opacity: 0.8"></div>
    <div id="content" role="dialog" aria-modal="true" aria-labelledby="title"
      data-vaul-drawer data-vaul-drawer-direction="${direction}" data-slot="drawer-content"
      data-state="closed" style="transform: translate3d(0, 120px, 0)">
      <h2 id="title">Cobrado</h2>
      <input id="note" />
      <button>Entendido</button>
    </div>`;
  return {
    content: document.getElementById("content")!,
    overlay: document.getElementById("overlay")!,
  };
}

const ghost = (part: string) =>
  document.querySelector<HTMLElement>(`[data-drawer-ghost="${part}"]`);

describe("leaveExitGhost", () => {
  it("leaves a copy nothing can reach in the drawer's place", () => {
    const { content } = drawer();
    leaveExitGhost(content, "content");

    const copy = ghost("content")!;
    expect(copy.parentNode).toBe(content.parentNode);
    expect(copy.textContent).toContain("Entendido");
    // Not the dialog, not a drawer the app waits on, not touchable.
    expect(copy.getAttribute("role")).toBeNull();
    expect(copy.getAttribute("aria-modal")).toBeNull();
    expect(copy.hasAttribute("data-vaul-drawer")).toBe(false);
    expect(copy.querySelector("[id]")).toBeNull();
    expect(copy.id).toBe("");
    expect(copy.getAttribute("aria-hidden")).toBe("true");
    expect(copy.inert).toBe(true);
    expect(copy.style.pointerEvents).toBe("none");
    // Still styled as a drawer from its side.
    expect(copy.getAttribute("data-vaul-drawer-direction")).toBe("bottom");
  });

  it("slides it off its side from where it is, as vaul does", () => {
    const { content } = drawer();
    leaveExitGhost(content, "content");

    expect(calls).toHaveLength(1);
    expect(calls[0].element).toBe(ghost("content"));
    expect(calls[0].keyframes).toEqual([
      { transform: "translate3d(0, 120px, 0)" },
      { transform: "translate3d(0, 100%, 0)" },
    ]);
    expect(calls[0].options).toMatchObject({
      duration: DRAWER_EXIT_MS,
      easing: DRAWER_EXIT_EASING,
    });
  });

  it("slides a side drawer off its own side", () => {
    const { content } = drawer("right");
    leaveExitGhost(content, "content");
    expect(calls[0].keyframes[1]).toEqual({
      transform: "translate3d(100%, 0, 0)",
    });
  });

  it("fades the overlay from how dim it is", () => {
    const { overlay } = drawer();
    leaveExitGhost(overlay, "overlay");
    expect(calls[0].keyframes).toEqual([{ opacity: "0.8" }, { opacity: "0" }]);
    expect(ghost("overlay")!.hasAttribute("data-vaul-overlay")).toBe(false);
  });

  it("keeps what was typed, which a copy would lose", () => {
    const { content } = drawer();
    (document.getElementById("note") as HTMLInputElement).value = "pagado";
    leaveExitGhost(content, "content");
    expect(ghost("content")!.querySelector("input")!.value).toBe("pagado");
  });

  it("goes once the slide is over", async () => {
    const { content } = drawer();
    leaveExitGhost(content, "content");
    expect(ghost("content")).not.toBeNull();
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(ghost("content")).toBeNull();
  });

  it("leaves nothing with reduced motion, off the page, or with no animation", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("reduce"),
      media: query,
    }));
    leaveExitGhost(drawer().content, "content");
    expect(ghost("content")).toBeNull();

    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    const { content } = drawer();
    content.remove();
    leaveExitGhost(content, "content");
    expect(ghost("content")).toBeNull();

    Reflect.deleteProperty(HTMLElement.prototype, "animate");
    leaveExitGhost(drawer().content, "content");
    expect(ghost("content")).toBeNull();
  });
});

describe("onDrawerPartDetach", () => {
  it("leaves a stand-in only for a drawer that closed", () => {
    const { content } = drawer();
    content.setAttribute("data-state", "open");
    // The screen navigated away with it open: it just goes.
    onDrawerPartDetach(content, "content");
    expect(ghost("content")).toBeNull();

    content.setAttribute("data-state", "closed");
    onDrawerPartDetach(content, "content");
    expect(ghost("content")).not.toBeNull();
  });
});
