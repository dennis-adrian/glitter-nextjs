"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  BarChart3Icon,
  PackageIcon,
  ReceiptTextIcon,
  ShoppingCartIcon,
  KeyRoundIcon,
  SettingsIcon,
} from "lucide-react";

import {
  normalizeStoreCategoryScope,
  STORE_CATEGORY_SCOPE_PARAM,
  storeCategoryScopeHref,
} from "@/app/lib/store/category";
import { cn } from "@/lib/utils";

const storeSections = [
  {
    value: "analytics",
    label: "Analíticas",
    href: "/dashboard/store/analytics",
    icon: BarChart3Icon,
  },
  {
    value: "payments",
    label: "Pagos",
    href: "/dashboard/store/payments",
    icon: ReceiptTextIcon,
  },
  {
    value: "orders",
    label: "Pedidos",
    href: "/dashboard/store/orders",
    icon: ShoppingCartIcon,
  },
  {
    value: "products",
    label: "Productos",
    href: "/dashboard/store/products",
    icon: PackageIcon,
  },
  {
    value: "rentals",
    label: "Alquileres",
    href: "/dashboard/store/rentals",
    icon: KeyRoundIcon,
  },
  {
    value: "settings",
    label: "Configuración",
    href: "/dashboard/store/settings",
    icon: SettingsIcon,
  },
] as const;

/** Sections whose data is category-scoped; the rest keep clean URLs. */
const SCOPED_SECTIONS = ["products", "orders", "analytics"];

function getActiveStoreSection(pathname: string) {
  if (pathname.startsWith("/dashboard/store/products")) return "products";
  if (pathname.startsWith("/dashboard/store/rentals")) return "rentals";
  if (pathname.startsWith("/dashboard/store/payments")) return "payments";
  if (pathname.startsWith("/dashboard/store/analytics")) return "analytics";
  if (pathname.startsWith("/dashboard/store/settings")) return "settings";
  return "orders";
}

type StoreNavProps = {
  pendingCount: number;
  isAdmin: boolean;
};

export default function StoreNav({ pendingCount, isAdmin }: StoreNavProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = getActiveStoreSection(pathname);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const sections = storeSections.filter(
    (section) => section.value !== "settings" || isAdmin,
  );
  const category = normalizeStoreCategoryScope(
    searchParams.get(STORE_CATEGORY_SCOPE_PARAM),
  );

  // On a phone the row scrolls, so the current section can start off-screen.
  // `block: "nearest"` keeps this from scrolling the page vertically too.
  useEffect(() => {
    activeRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [active]);

  // Carry the scope between scoped sections only; page-specific filters are
  // intentionally dropped when changing section.
  function sectionHref(value: string, href: string) {
    return SCOPED_SECTIONS.includes(value)
      ? storeCategoryScopeHref(href, category)
      : href;
  }

  return (
    <div className="sticky top-16 z-40 -mx-3 border-b bg-background/95 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:top-20 md:-mx-6 md:px-6">
      <nav
        aria-label="Secciones de la tienda"
        className="overflow-x-auto rounded-2xl border border-border/70 bg-muted/30 p-1 shadow-sm [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max min-w-full gap-1">
          {sections.map(({ value, label, href, icon: Icon }) => {
            const isActive = active === value;

            return (
              <Link
                key={value}
                ref={isActive ? activeRef : undefined}
                href={sectionHref(value, href)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-background text-primary shadow-sm"
                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
                {value === "payments" && pendingCount > 0 && (
                  <span className="ml-0.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
