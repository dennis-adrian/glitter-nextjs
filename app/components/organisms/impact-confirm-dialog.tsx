"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { buttonVariants } from "@/app/components/ui/button";
import { cn } from "@/app/lib/utils";

export type ImpactItem = {
  label: string;
  count: number;
  tone?: "default" | "danger";
};

type ImpactConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  items?: ImpactItem[];
  blocked?: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  confirmPending?: boolean;
};

export default function ImpactConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  items = [],
  blocked = false,
  confirmLabel,
  onConfirm,
  confirmPending = false,
}: ImpactConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {items.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {items.map((item) => (
              <li key={item.label} className="flex justify-between gap-4">
                <span
                  className={cn(
                    item.tone === "danger" && "text-destructive font-medium",
                  )}
                >
                  {item.label}
                </span>
                <span
                  className={cn(
                    "tabular-nums text-muted-foreground",
                    item.tone === "danger" && "text-destructive",
                  )}
                >
                  {item.count}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cerrar</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: "destructive" })}
            disabled={blocked || confirmPending}
            onClick={(event) => {
              event.preventDefault();
              if (blocked) return;
              onConfirm();
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
