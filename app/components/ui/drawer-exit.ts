/**
 * A drawer's slide-out, played on a stand-in so the page is usable at once.
 *
 * vaul slides a closing drawer away with a 0.5s CSS animation, and Radix
 * keeps the whole modal layer mounted until that animation ends: the
 * full-screen overlay, the scroll lock that cancels every touchmove on the
 * page, and `pointer-events: none` on <body>. So for half a second after a
 * drawer had visibly gone away, a swipe did nothing and had to be repeated.
 *
 * Instead, the real drawer and overlay leave the moment they close (globals
 * css turns their exit animation off, so Radix unmounts them on the spot,
 * lock and all), and just before they go, a copy of each takes their place
 * and plays the exit: inert, hidden from assistive tech, and transparent to
 * touches, so the page underneath scrolls and taps through it.
 */

/** vaul's own exit: its duration and easing. */
export const DRAWER_EXIT_MS = 500;
export const DRAWER_EXIT_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Marks a stand-in; globals.css and the pull to refresh read it. */
export const DRAWER_GHOST_ATTRIBUTE = "data-drawer-ghost";

type Part = "content" | "overlay";

const OFFSCREEN: Record<string, string> = {
  bottom: "translate3d(0, 100%, 0)",
  top: "translate3d(0, -100%, 0)",
  left: "translate3d(-100%, 0, 0)",
  right: "translate3d(100%, 0, 0)",
};

/**
 * What the user sees of a form inside the drawer, which cloning leaves
 * behind: typed values, choices, and how far a box has been scrolled.
 */
function copyLiveState(from: Element, to: Element) {
  const sources = [from, ...from.querySelectorAll("*")];
  const copies = [to, ...to.querySelectorAll("*")];
  sources.forEach((source, index) => {
    const copy = copies[index];
    if (!copy) return;
    if (
      (source instanceof HTMLInputElement && copy instanceof HTMLInputElement) ||
      (source instanceof HTMLTextAreaElement &&
        copy instanceof HTMLTextAreaElement) ||
      (source instanceof HTMLSelectElement && copy instanceof HTMLSelectElement)
    ) {
      copy.value = source.value;
      if (source instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
        copy.checked = source.checked;
      }
    }
    if (source.scrollTop) copy.scrollTop = source.scrollTop;
    if (source.scrollLeft) copy.scrollLeft = source.scrollLeft;
  });
}

/**
 * Leaves a stand-in for a closing drawer part, playing its exit from where
 * it is now (a drawer let go mid-swipe slides on from there). Does nothing
 * when the part is not on the page, when motion is reduced, or where the
 * browser cannot animate it: the drawer then just goes, as it would.
 */
export function leaveExitGhost(node: HTMLElement, part: Part): void {
  if (!node.isConnected || !node.parentNode) return;
  const view = node.ownerDocument.defaultView;
  if (!view) return;
  if (view.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

  const ghost = node.cloneNode(true) as HTMLElement;
  if (typeof ghost.animate !== "function") return;

  const style = view.getComputedStyle(node);
  // Not the dialog any more: no ids to collide, no role, nothing to reach.
  for (const element of [ghost, ...ghost.querySelectorAll("[id]")]) {
    element.removeAttribute("id");
  }
  ghost.removeAttribute("role");
  ghost.removeAttribute("aria-modal");
  ghost.removeAttribute("aria-labelledby");
  ghost.removeAttribute("aria-describedby");
  // vaul's styles and the app's "a drawer is open" checks key on these.
  ghost.removeAttribute("data-vaul-drawer");
  ghost.removeAttribute("data-vaul-overlay");
  ghost.removeAttribute("data-slot");
  ghost.setAttribute(DRAWER_GHOST_ATTRIBUTE, part);
  ghost.setAttribute("aria-hidden", "true");
  ghost.inert = true;
  ghost.style.pointerEvents = "none";
  ghost.style.transition = "none";
  ghost.style.animation = "none";

  node.parentNode.appendChild(ghost);
  copyLiveState(node, ghost);

  const options: KeyframeAnimationOptions = {
    duration: DRAWER_EXIT_MS,
    easing: DRAWER_EXIT_EASING,
    fill: "forwards",
  };
  let animation: Animation;
  if (part === "overlay") {
    animation = ghost.animate(
      [{ opacity: style.opacity || "1" }, { opacity: "0" }],
      options,
    );
  } else {
    const from = style.transform && style.transform !== "none"
      ? style.transform
      : "translate3d(0, 0, 0)";
    const direction =
      node.getAttribute("data-vaul-drawer-direction") ?? "bottom";
    animation = ghost.animate(
      [{ transform: from }, { transform: OFFSCREEN[direction] ?? OFFSCREEN.bottom }],
      options,
    );
  }

  const remove = () => ghost.remove();
  animation.finished.then(remove, remove);
  // Should the animation never settle (a background tab), it still goes.
  view.setTimeout(remove, DRAWER_EXIT_MS + 200);
}

/**
 * Leaves the stand-in for a part that is being taken off the page closed.
 * Called as its ref lets go of it: React does that before it takes the
 * element out, so the part is still in place to be measured and copied. A
 * part that goes while open (the screen navigated away under it) just goes.
 */
export function onDrawerPartDetach(node: HTMLElement, part: Part): void {
  if (node.getAttribute("data-state") === "closed") {
    leaveExitGhost(node, part);
  }
}
