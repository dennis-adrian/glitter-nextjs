"use client";

import type { ReactNode } from "react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

type GuardedMenuItemProps = {
  children: ReactNode;
  /** When set, the item renders disabled and shows this as the reason. */
  disabledReason?: string;
  onSelect?: () => void;
  destructive?: boolean;
};

/**
 * A menu item that stays visible when it cannot be used, and says why.
 *
 * A control that disappears reads as a broken or missing feature, and leaves
 * an admin guessing which state removed it. Keeping it in place with its
 * reason attached teaches the state machine instead.
 */
export default function GuardedMenuItem({
  children,
  disabledReason,
  onSelect,
  destructive = false,
}: GuardedMenuItemProps) {
  const disabled = Boolean(disabledReason);

  return (
    <DropdownMenuItem
      disabled={disabled}
      onSelect={disabled ? undefined : onSelect}
      className={
        destructive && !disabled
          ? "text-destructive focus:text-destructive"
          : undefined
      }
    >
      <div className="flex flex-col gap-0.5">
        <span className="flex items-center">{children}</span>
        {disabledReason && (
          <span className="text-xs text-muted-foreground">
            {disabledReason}
          </span>
        )}
      </div>
    </DropdownMenuItem>
  );
}
