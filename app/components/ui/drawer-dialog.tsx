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
	open,
	onOpenChange,
	...props
}: DrawerDialogProps & DialogProps) => {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const Component = isDesktop ? Dialog : Drawer;

	return (
		<Component open={open} onOpenChange={onOpenChange} modal={props.modal}>
			{children}
		</Component>
	);
};

const DrawerDialogTrigger = ({ children }: DrawerDialogProps) => {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const Component = isDesktop ? DialogTrigger : DrawerTrigger;
	return <Component asChild>{children}</Component>;
};

const DrawerDialogTitle = ({ children }: DrawerDialogProps) => {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const Component = isDesktop ? DialogTitle : DrawerTitle;
	return <Component>{children}</Component>;
};

const DrawerDialogDescription = ({ children, ...props }: DrawerDialogProps) => {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const Component = isDesktop ? DialogDescription : DrawerDescription;
	return <Component {...props}>{children}</Component>;
};

const DrawerDialogContent = ({ children, ...props }: DrawerDialogProps) => {
	const isDesktop = useMediaQuery("(min-width: 768px)");
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

const DrawerDialogHeader = ({ children }: DrawerDialogProps) => {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	const Component = isDesktop ? DialogHeader : DrawerHeader;
	return <Component>{children}</Component>;
};

const DrawerDialogFooter = ({ children, ...props }: DrawerDialogProps) => {
	const isDesktop = useMediaQuery("(min-width: 768px)");
	return isDesktop ? null : <DrawerFooter {...props}>{children}</DrawerFooter>;
};

const DrawerDialogClose = ({ children }: DrawerDialogProps) => {
	const isDesktop = useMediaQuery("(min-width: 768px)");
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
