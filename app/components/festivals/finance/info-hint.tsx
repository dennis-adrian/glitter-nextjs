"use client";

import { InfoIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/app/components/ui/button";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/app/components/ui/tooltip";
import { useMediaQuery } from "@/app/hooks/use-media-query";

/**
 * An explanation kept out of the way: an info button beside a title. On wider
 * screens it shows a tooltip on hover or keyboard focus (Esc closes it); a
 * phone has no hover, so a tap opens a bottom drawer. For text that explains a
 * figure, never for the figure itself, and never for anything to click: a
 * tooltip closes as the pointer leaves it.
 */
export default function InfoHint({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const trigger = (
    <button
      type="button"
      aria-label={`Qué es ${title}`}
      // 24px to look at, 44px to hit on a phone.
      className="-m-2.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:-m-0.5 md:h-6 md:w-6"
    >
      <InfoIcon className="h-4 w-4" aria-hidden />
    </button>
  );

  if (isDesktop) {
    return (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent align="start" className="max-w-80 px-3.5 py-3 text-sm leading-relaxed">
            <p className="mb-1 font-semibold">{title}</p>
            <div className="opacity-85">{children}</div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription asChild>
            <div className="text-base">{children}</div>
          </DrawerDescription>
        </DrawerHeader>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Entendido</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
