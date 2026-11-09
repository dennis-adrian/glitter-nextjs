"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "vaul";

import { onDrawerPartDetach } from "@/app/components/ui/drawer-exit";
import { useOverlayOwnership } from "@/lib/overlay-ownership";
import { cn } from "@/lib/utils";

function Drawer({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false,
  );
  const isControlled = open !== undefined;
  const isOpen = isControlled ? !!open : uncontrolledOpen;

  useOverlayOwnership(isOpen);

  return (
    <>
      {/*
       * Vaul uses Radix Dialog internally but never passes `modal` to it,
       * so Radix always runs in modal mode and sets `pointer-events: none`
       * on `<body>`. Vaul tries to undo this via requestAnimationFrame,
       * but with controlled state (`open` prop) the timing race is lost.
       * This style tag wins regardless of timing via CSS !important.
       */}
      {isOpen && props.modal === false && (
        <style>{`body { pointer-events: auto !important; }`}</style>
      )}
      <DrawerPrimitive.Root
        data-slot="drawer"
        /*
         * Off: vaul's iOS scroll lock (a copy of react-aria's
         * usePreventScroll, active whenever `navigator.platform` is an
         * iPhone or iPad). It scrolls the window to the top on open without
         * the negative body margin that would hide it, so a scrolled page
         * jumps to its top under the drawer. It also switches itself off
         * while a finger is down on the drawer and back on as it lifts, so
         * every tap inside scrolls the page back and then to the top again
         * mid-touch; iOS takes that for a scroll and drops the click, and a
         * close button does nothing once the page has been scrolled. The
         * page stays locked without it: Radix's modal layer blocks scrolling
         * outside the drawer. Despite its name and its docs, vaul runs this
         * lock when the prop is `true` (its default) and skips it on `false`.
         * Placed before the spread so a caller can still opt back in.
         */
        disablePreventScroll={false}
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={(next) => {
          if (!isControlled) {
            setUncontrolledOpen(next);
          }
          onOpenChange?.(next);
        }}
        {...props}
      />
    </>
  );
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Portal>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

/**
 * The caller's ref, plus a note of when the part leaves the page closed, to
 * leave its exit's stand-in. vaul composes refs with its own helper, which
 * calls them with `null` on the way out and drops a returned cleanup, so the
 * part is remembered here. Stable, so React does not let go and take hold
 * again on every render.
 */
/** Hands `node` to a caller's ref of either kind. */
function assignRef<T>(ref: React.Ref<T> | undefined, node: T | null) {
  if (typeof ref === "function") ref(node);
  else if (ref) (ref as React.RefObject<T | null>).current = node;
}

function useExitRef<T extends HTMLElement>(
  part: "content" | "overlay",
  ref: React.Ref<T> | undefined,
): React.RefCallback<T> {
  const attached = React.useRef<T | null>(null);
  return React.useCallback(
    (node: T | null) => {
      const previous = attached.current;
      attached.current = node;
      if (!node && previous) onDrawerPartDetach(previous, part);
      assignRef(ref, node);
    },
    [part, ref],
  );
}

function DrawerOverlay({
  className,
  ref,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  const exitRef = useExitRef("overlay", ref);
  return (
    <DrawerPrimitive.Overlay
      ref={exitRef}
      data-slot="drawer-overlay"
      className={cn(
        "data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50",
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  const exitRef = useExitRef("content", ref);
  return (
    <DrawerPortal data-slot="drawer-portal">
      <DrawerOverlay />
      <DrawerPrimitive.Content
        ref={exitRef}
        data-slot="drawer-content"
        className={cn(
          "bg-background flex h-auto flex-col text-sm data-[vaul-drawer-direction=bottom]:inset-x-0 data-[vaul-drawer-direction=bottom]:bottom-0 data-[vaul-drawer-direction=bottom]:mt-24 data-[vaul-drawer-direction=bottom]:max-h-[80vh] data-[vaul-drawer-direction=bottom]:rounded-t-xl data-[vaul-drawer-direction=bottom]:border-t data-[vaul-drawer-direction=left]:inset-y-0 data-[vaul-drawer-direction=left]:left-0 data-[vaul-drawer-direction=left]:w-3/4 data-[vaul-drawer-direction=left]:rounded-r-xl data-[vaul-drawer-direction=left]:border-r data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:w-3/4 data-[vaul-drawer-direction=right]:rounded-l-xl data-[vaul-drawer-direction=right]:border-l data-[vaul-drawer-direction=top]:inset-x-0 data-[vaul-drawer-direction=top]:top-0 data-[vaul-drawer-direction=top]:mb-24 data-[vaul-drawer-direction=top]:max-h-[80vh] data-[vaul-drawer-direction=top]:rounded-b-xl data-[vaul-drawer-direction=top]:border-b data-[vaul-drawer-direction=left]:sm:max-w-sm data-[vaul-drawer-direction=right]:sm:max-w-sm group/drawer-content fixed z-50",
          className,
        )}
        {...props}
      >
        <div className="bg-muted mt-4 h-1 w-25 rounded-full mx-auto hidden shrink-0 group-data-[vaul-drawer-direction=bottom]/drawer-content:block" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        "gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-0.5 md:text-left flex flex-col",
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("gap-2 p-4 mt-auto flex flex-col", className)}
      {...props}
    />
  );
}

function DrawerTitle({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-foreground text-base font-medium", className)}
      {...props}
    />
  );
}

function DrawerDescription({
  className,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
