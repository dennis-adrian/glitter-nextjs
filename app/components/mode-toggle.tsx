"use client";

import { MonitorIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import { cn } from "@/app/lib/utils";

const THEME_OPTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Claro", icon: SunIcon },
  { value: "dark", label: "Oscuro", icon: MoonIcon },
  { value: "system", label: "Sistema", icon: MonitorIcon },
];

/**
 * Icon button that opens the theme menu. The sun/moon swap is driven by the
 * `.dark` class rather than `useTheme`, so the server HTML already shows the
 * right icon and there is nothing to reconcile on hydration.
 */
export function ModeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        variant="ghost"
        size="icon"
        aria-label="Cambiar tema"
        className={cn(
          "relative size-9 text-brand-ink hover:bg-brand-lavender hover:text-brand-primary",
          className,
        )}
      >
        <SunIcon className="size-5 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
        <MoonIcon className="absolute size-5 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Tema</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
          {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="mr-2 size-4" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The same three choices laid out as a segmented control, for places with
 * room to show them all at once (the mobile menu).
 *
 * Only render it client-side after mount, e.g. inside a sheet or dialog:
 * the stored theme is unknown on the server, so the pressed state would not
 * match the server HTML.
 */
export function ThemeSegmentedControl({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn(
        "grid grid-cols-3 gap-1 rounded-full border border-brand-border bg-brand-card p-1",
        className,
      )}
    >
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
        const checked = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-full px-2 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              checked
                ? "bg-brand-lavender text-brand-primary"
                : "text-brand-neutral hover:text-brand-ink",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
