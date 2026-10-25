"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState, useSyncExternalStore } from "react";

import {
  ChevronDownIcon,
  ChevronsUpDownIcon,
  CircleUserIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  UserIcon,
} from "lucide-react";

import type { NavbarProfile } from "@/app/api/users/definitions";
import ThemeImage from "@/app/components/atoms/theme-image";
import {
  ModeToggle,
  ThemeSegmentedControl,
} from "@/app/components/mode-toggle";
import {
  isNavLinkActive,
  PORTAL_HREF,
  type NavGroup,
  type NavLink,
  type NavSection,
  type NavViewer,
} from "@/app/components/navbar/app-navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/app/components/ui/dropdown-menu";
import SignOutButton from "@/app/components/user_dropdown/sign-out-button";
import { cn } from "@/app/lib/utils";

const COLLAPSED_STORAGE_KEY = "glitter:sidebar-collapsed";

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

const collapsedListeners = new Set<() => void>();

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    // A private window or blocked storage only loses the preference.
  }
  collapsedListeners.forEach((listener) => listener());
}

/** The preference, shared with other tabs through the `storage` event. */
function subscribeCollapsed(listener: () => void) {
  collapsedListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    collapsedListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The server cannot know, so it always draws the sidebar expanded. */
function serverCollapsed() {
  return false;
}

function roleLabel(viewer: NavViewer | null) {
  if (viewer?.role === "admin") return "Administración";
  if (viewer?.role === "festival_admin") return "Admin de festival";
  if (viewer?.status === "verified") return "Perfil verificado";
  if (viewer?.status === "pending") return "Perfil en revisión";
  return "Participante";
}

function SidebarLink({
  link,
  pathname,
  collapsed,
  active: activeOverride,
}: {
  link: NavLink;
  pathname: string;
  collapsed: boolean;
  /** Set when the entry stands for more pages than its own href. */
  active?: boolean;
}) {
  const active = activeOverride ?? isNavLinkActive(link, pathname);
  const Icon = link.icon;

  return (
    <li>
      <Link
        href={link.href}
        aria-current={active ? "page" : undefined}
        title={collapsed ? link.label : undefined}
        className={cn(
          "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-brand-ink transition-colors hover:bg-brand-lavender hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
          active && "bg-brand-lavender font-semibold text-brand-primary",
          collapsed && "justify-center px-0",
        )}
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <span className={cn("truncate", collapsed && "sr-only")}>
          {link.label}
        </span>
        {link.isNew ? (
          <>
            <span
              aria-hidden="true"
              className={cn(
                "size-2 shrink-0 rounded-full bg-primary",
                collapsed ? "absolute right-2 top-2" : "ml-auto",
              )}
            />
            <span className="sr-only">(nuevo)</span>
          </>
        ) : null}
      </Link>
    </li>
  );
}

function SidebarSection({
  section,
  pathname,
  collapsed,
}: {
  section: NavSection;
  pathname: string;
  collapsed: boolean;
}) {
  const listId = useId();
  const containsActive = section.items.some((item) =>
    isNavLinkActive(item, pathname),
  );
  const [open, setOpen] = useState(containsActive);
  const Icon = section.icon;

  // A rail has no room for a sub-list: the section becomes one icon that
  // opens its first page, and widening the sidebar shows the rest.
  if (collapsed) {
    const first = section.items[0];
    return (
      <SidebarLink
        link={{ ...first, label: section.label, icon: section.icon }}
        pathname={pathname}
        collapsed
        active={containsActive}
      />
    );
  }

  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-brand-ink transition-colors hover:bg-brand-lavender hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <span className="flex-1 truncate">{section.label}</span>
        <ChevronDownIcon
          className={cn(
            "size-4 shrink-0 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>
      <ul
        id={listId}
        hidden={!open}
        className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-brand-border pl-2"
      >
        {section.items.map((item) => (
          <SidebarLink
            key={item.key}
            link={item}
            pathname={pathname}
            collapsed={false}
          />
        ))}
      </ul>
    </li>
  );
}

function AccountCard({
  profile,
  viewer,
  collapsed,
}: {
  profile: NavbarProfile | null;
  viewer: NavViewer | null;
  collapsed: boolean;
}) {
  const name =
    profile?.displayName ||
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    "Mi cuenta";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Cuenta de ${name}`}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-brand-lavender focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary",
          collapsed && "justify-center",
        )}
      >
        {profile?.imageUrl ? (
          <span className="relative size-9 shrink-0 overflow-hidden rounded-full bg-muted">
            <Image
              src={profile.imageUrl}
              alt=""
              width={36}
              height={36}
              className="size-full object-cover"
            />
          </span>
        ) : (
          <CircleUserIcon
            className="size-9 shrink-0 text-brand-primary"
            aria-hidden="true"
          />
        )}
        {collapsed ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-bold text-brand-ink">
                {name}
              </span>
              <span className="truncate text-xs text-brand-neutral">
                {roleLabel(viewer)}
              </span>
            </span>
            <ChevronsUpDownIcon
              className="size-4 shrink-0 text-brand-neutral"
              aria-hidden="true"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/my_profile">
            <UserIcon className="mr-2 size-4" aria-hidden="true" />
            <span>Mi perfil</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignOutButton />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type AppSidebarProps = {
  groups: NavGroup[];
  profile: NavbarProfile | null;
  viewer: NavViewer | null;
};

/**
 * The signed-in desktop navigation. It is fixed to the left edge and the page
 * makes room for it through CSS (`body:has([data-app-sidebar])`), so the
 * layout never has to know whether someone is signed in.
 */
export default function AppSidebar({
  groups,
  profile,
  viewer,
}: AppSidebarProps) {
  const pathname = usePathname() ?? "/";
  const collapsed = useSyncExternalStore(
    subscribeCollapsed,
    readCollapsed,
    serverCollapsed,
  );

  function toggle() {
    writeCollapsed(!collapsed);
  }

  return (
    <aside
      data-app-sidebar=""
      data-collapsed={collapsed ? "" : undefined}
      aria-label="Navegación principal"
      className="fixed inset-y-0 left-0 z-40 hidden w-(--app-sidebar-width) flex-col border-r border-brand-border bg-brand-elevated lg:flex"
    >
      <div
        className={cn(
          "flex h-[84px] shrink-0 items-center gap-2 px-4",
          collapsed ? "justify-center px-2" : "justify-between",
        )}
      >
        {collapsed ? null : (
          <Link
            href={PORTAL_HREF}
            aria-label="Productora Glitter, inicio"
            className="rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary"
          >
            <ThemeImage
              srcLight="/img/logo/glitter-logo-full-primary-1696x739.png"
              srcDark="/img/logo/glitter-logo-full-white-1696x741.png"
              alt="Productora Glitter"
              width={1696}
              height={739}
              sizes="112px"
              className="h-auto w-[112px] object-contain"
            />
          </Link>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          aria-pressed={collapsed}
          className="inline-flex size-9 items-center justify-center rounded-full text-brand-ink transition-colors hover:bg-brand-lavender hover:text-brand-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
        >
          {collapsed ? (
            <PanelLeftOpenIcon className="size-5" aria-hidden="true" />
          ) : (
            <PanelLeftCloseIcon className="size-5" aria-hidden="true" />
          )}
        </button>
      </div>

      <nav className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 pb-3">
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col">
            {collapsed ? (
              <span
                aria-hidden="true"
                className="mx-auto my-2 h-px w-8 bg-brand-border"
              />
            ) : (
              <h2 className="px-3 pb-1.5 pt-4 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-neutral">
                {group.label}
              </h2>
            )}
            <ul
              aria-label={collapsed ? group.label : undefined}
              className="flex flex-col gap-0.5"
            >
              {group.items.map((item) => (
                <SidebarLink
                  key={item.key}
                  link={item}
                  pathname={pathname}
                  collapsed={collapsed}
                />
              ))}
              {group.sections?.map((section) => (
                <SidebarSection
                  key={section.key}
                  section={section}
                  pathname={pathname}
                  collapsed={collapsed}
                />
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="flex shrink-0 flex-col gap-2 border-t border-brand-border p-3">
        {collapsed ? (
          <ModeToggle className="mx-auto" />
        ) : (
          <ThemeSegmentedControl />
        )}
        <AccountCard profile={profile} viewer={viewer} collapsed={collapsed} />
      </div>
    </aside>
  );
}
