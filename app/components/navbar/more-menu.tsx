"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useClerk } from "@clerk/nextjs";
import { ChevronRightIcon, CircleUserIcon, LogOutIcon } from "lucide-react";

import Heading from "@/app/components/atoms/heading";
import { ThemeSegmentedControl } from "@/app/components/mode-toggle";
import {
  buildAppNavigation,
  type NavLink,
  type NavViewer,
} from "@/app/components/navbar/app-navigation";
import { forgetThisBrowserForPush } from "@/app/components/notifications/use-push-device";
import { Button } from "@/app/components/ui/button";

function statusLabel(viewer: NavViewer) {
  if (viewer.role === "admin") return "Administración";
  if (viewer.role === "festival_admin") return "Admin de festival";
  if (viewer.status === "verified") return "Perfil verificado";
  if (viewer.status === "pending") return "Perfil en revisión";
  return "Mi perfil";
}

function Row({ link }: { link: NavLink }) {
  const Icon = link.icon;

  return (
    <li className="border-b border-brand-border last:border-b-0">
      <Link
        href={link.href}
        className="flex min-h-12 items-center gap-3 px-1 py-2 text-[15px] font-medium text-brand-ink hover:text-brand-primary"
      >
        <Icon className="size-5 shrink-0" aria-hidden="true" />
        <span className="flex-1">{link.label}</span>
        {link.isNew ? (
          <>
            <span
              aria-hidden="true"
              className="size-2 shrink-0 rounded-full bg-primary"
            />
            <span className="sr-only">(nuevo)</span>
          </>
        ) : null}
        <ChevronRightIcon
          className="size-4 shrink-0 text-brand-neutral"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-brand-neutral">
        {title}
      </h2>
      <div className="rounded-2xl border border-brand-border bg-brand-card px-4">
        {children}
      </div>
    </section>
  );
}

type MoreMenuProps = {
  viewer: NavViewer;
  account: { name: string; imageUrl: string | null };
  programsHref: string | null;
  blogEnabled: boolean;
  creditsEnabled: boolean;
};

export default function MoreMenu({
  viewer,
  account,
  programsHref,
  blogEnabled,
  creditsEnabled,
}: MoreMenuProps) {
  const { signOut } = useClerk();
  const router = useRouter();
  const { groups } = buildAppNavigation({
    viewer,
    programsHref,
    blogEnabled,
    creditsEnabled,
  });

  // Mi espacio first: in the installed app the destinations in "Explorar"
  // already have tabs, so the personal pages are what people come here for.
  const ordered = [
    ...groups.filter((group) => group.key === "mine"),
    ...groups.filter((group) => group.key !== "mine"),
  ];

  return (
    <div className="container flex max-w-xl flex-col gap-5 p-4 md:p-6">
      <Heading>Más</Heading>

      <Link
        href="/my_profile"
        className="flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-card p-3 hover:border-brand-primary"
      >
        {account.imageUrl ? (
          <span className="relative size-12 shrink-0 overflow-hidden rounded-full bg-muted">
            <Image
              src={account.imageUrl}
              alt=""
              width={48}
              height={48}
              className="size-full object-cover"
            />
          </span>
        ) : (
          <CircleUserIcon
            className="size-12 shrink-0 text-brand-primary"
            aria-hidden="true"
          />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-bold text-brand-ink">
            {account.name}
          </span>
          <span className="truncate text-sm text-brand-neutral">
            Mi perfil · {statusLabel(viewer)}
          </span>
        </span>
        <ChevronRightIcon
          className="size-4 shrink-0 text-brand-neutral"
          aria-hidden="true"
        />
      </Link>

      {ordered.map((group) => (
        <Card key={group.key} title={group.label}>
          {group.items.length > 0 ? (
            <ul>
              {group.items.map((item) => (
                <Row key={item.key} link={item} />
              ))}
            </ul>
          ) : null}
          {group.sections?.map((section) => (
            <div key={section.key} className="py-2">
              <h3 className="flex items-center gap-2 pt-1 text-sm font-semibold text-brand-ink">
                <section.icon className="size-4" aria-hidden="true" />
                {section.label}
              </h3>
              <ul>
                {section.items.map((item) => (
                  <Row key={item.key} link={item} />
                ))}
              </ul>
            </div>
          ))}
        </Card>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.1em] text-brand-neutral">
          Tema
        </h2>
        <ThemeSegmentedControl />
      </section>

      <Button
        variant="outline"
        className="w-full text-destructive"
        onClick={async () => {
          await forgetThisBrowserForPush();
          await signOut(() => router.push("/"));
        }}
      >
        <LogOutIcon className="mr-2 size-4" aria-hidden="true" />
        Cerrar sesión
      </Button>
    </div>
  );
}
