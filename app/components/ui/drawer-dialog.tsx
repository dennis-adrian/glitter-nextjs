"use client";

import * as React from "react";

import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { DialogProps } from "@radix-ui/react-dialog";

type DrawerDialogProps = {
  children: React.ReactNode;
  isDesktop?: boolean;
} & React.HTMLAttributes<HTMLDivElement>;

const DrawerDialog = ({
  children,
  isDesktop = false,
  open,
  onOpenChange,
  dismissible,
  ...props
}: DrawerDialogProps &
  DialogProps & {
    /**
     * Drawer only: false stops a swipe from dragging it away, for while it
     * holds work that must not be interrupted. A dialog has no swipe.
     */
    dismissible?: boolean;
  }) => {
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange} modal={props.modal}>
        {children}
      </Dialog>
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      modal={props.modal}
      dismissible={dismissible}
    >
      {children}
    </Drawer>
  );
};

const DrawerDialogTrigger = ({
  children,
  isDesktop = false,
}: DrawerDialogProps) => {
  const Component = isDesktop ? DialogTrigger : DrawerTrigger;
  return <Component asChild>{children}</Component>;
};

const DrawerDialogTitle = ({
  children,
  isDesktop = false,
}: DrawerDialogProps) => {
  const Component = isDesktop ? DialogTitle : DrawerTitle;
  return <Component>{children}</Component>;
};

const DrawerDialogDescription = ({
  children,
  isDesktop = false,
  ...props
}: DrawerDialogProps) => {
  const Component = isDesktop ? DialogDescription : DrawerDescription;
  return <Component {...props}>{children}</Component>;
};

/**
 * Dismissal is prevented by default, which suits a dialog holding unsaved
 * input. Callers that are browse surfaces pass their own no-op handlers to get
 * click-outside-to-close back, so those callbacks have to be part of the type.
 */
type DrawerDialogContentProps = DrawerDialogProps &
  Pick<
    React.ComponentPropsWithoutRef<typeof DialogContent>,
    "onPointerDownOutside" | "onInteractOutside" | "onEscapeKeyDown"
  >;

const DrawerDialogContent = ({
  children,
  isDesktop = false,
  ...props
}: DrawerDialogContentProps) => {
  const Component = isDesktop ? DialogContent : DrawerContent;
  return (
    <Component
      onPointerDownOutside={(e) => e.preventDefault()}
      onInteractOutside={(e) => e.preventDefault()}
      {...props}
    >
      {children}
    </Component>
  );
};

const DrawerDialogHeader = ({
  children,
  isDesktop = false,
}: DrawerDialogProps) => {
  const Component = isDesktop ? DialogHeader : DrawerHeader;
  return <Component>{children}</Component>;
};

const DrawerDialogFooter = ({
  children,
  isDesktop = false,
  ...props
}: DrawerDialogProps) => {
  return isDesktop ? null : <DrawerFooter {...props}>{children}</DrawerFooter>;
};

const DrawerDialogClose = ({
  children,
  isDesktop = false,
}: DrawerDialogProps) => {
  const Component = isDesktop ? DialogClose : DrawerClose;
  return <Component asChild>{children}</Component>;
};

export {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
};
