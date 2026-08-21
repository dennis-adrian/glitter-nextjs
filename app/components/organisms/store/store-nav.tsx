"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3Icon,
  PackageIcon,
  ReceiptTextIcon,
  ShoppingCartIcon,
  KeyRoundIcon,
  SettingsIcon,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/app/components/ui/select";
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = getActiveStoreSection(pathname);
  const sections = storeSections.filter(
    (section) => section.value !== "settings" || isAdmin,
  );
  const category = normalizeStoreCategoryScope(
    searchParams.get(STORE_CATEGORY_SCOPE_PARAM),
  );

  // Carry the scope between scoped sections only; page-specific filters are
  // intentionally dropped when changing section.
  function sectionHref(value: string, href: string) {
    return SCOPED_SECTIONS.includes(value)
      ? storeCategoryScopeHref(href, category)
      : href;
  }

  return (
    <div className="sticky top-16 z-40 -mx-3 border-b bg-background/95 px-3 py-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:top-20 md:-mx-6 md:px-6">
      <div className="flex flex-col gap-3">
        <div className="md:hidden">
          <p className="mb-2 text-sm font-medium text-muted-foreground">
            Sección
          </p>
          <Select
            value={active}
            onValueChange={(value) => {
              const targetSection = sections.find(
                (section) => section.value === value,
              );
              if (targetSection) {
                router.push(
                  sectionHref(targetSection.value, targetSection.href),
                );
              }
            }}
          >
            <SelectTrigger className="h-11 rounded-xl border-border/70 bg-muted/30">
              <SelectValue placeholder="Selecciona una sección" />
            </SelectTrigger>
            <SelectContent>
              {sections.map(({ value, label, icon: Icon }) => (
                <SelectItem key={value} value={value}>
                  <span className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {label}
                    {value === "payments" && pendingCount > 0 && (
                      <span className="ml-0.5 h-2 w-2 rounded-full bg-primary" />
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <nav className="hidden overflow-x-auto rounded-2xl border border-border/70 bg-muted/30 p-1 shadow-sm md:block">
          <div className="flex w-max min-w-full gap-1 pb-1">
            {sections.map(({ value, label, href, icon: Icon }) => {
              const isActive = active === value;

              return (
                <Link
                  key={value}
                  href={sectionHref(value, href)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-background text-primary shadow-sm"
                      : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {value === "payments" && pendingCount > 0 && (
                    <span className="ml-0.5 h-2 w-2 rounded-full bg-primary" />
                  )}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
