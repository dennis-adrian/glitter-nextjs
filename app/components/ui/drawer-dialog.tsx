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
}: DrawerDialogProps & DialogProps) => {
  const Component = isDesktop ? Dialog : Drawer;

  return (
    <Component open={open} onOpenChange={onOpenChange}>
      {children}
    </Component>
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

const DrawerDialogContent = ({
  children,
  isDesktop = false,
}: DrawerDialogProps) => {
  const Component = isDesktop ? DialogContent : DrawerContent;
  return <Component>{children}</Component>;
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
