import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import Heading from "@/app/components/atoms/heading";
import { staffMenuSection } from "@/app/components/navbar/app-navigation";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

type PageProps = { params: Promise<{ section: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { section } = await params;
  return { title: section === "programas" ? "Programas" : "Configuración" };
}

/**
 * One staff section on a screen of its own, opened from "Más": its pages as
 * plain rows, by name. Keeps "Más" short instead of listing every page.
 */
export default async function StaffMenuSectionPage({ params }: PageProps) {
  const [{ section: slug }, profile] = await Promise.all([
    params,
    getCurrentUserProfile(),
  ]);
  if (!profile) redirect("/sign_in");

  const section = staffMenuSection(
    { role: profile.role, status: profile.status },
    slug,
  );
  if (!section) notFound();

  return (
    <div className="container flex max-w-xl flex-col gap-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/menu"
          aria-label="Volver a Más"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-brand-border bg-brand-card text-brand-ink hover:text-brand-primary"
        >
          <ChevronLeftIcon className="size-5" aria-hidden="true" />
        </Link>
        <Heading className="text-2xl leading-none md:text-3xl lg:text-3xl">
          {section.label}
        </Heading>
      </div>
      <ul className="rounded-2xl border border-brand-border bg-brand-card px-4">
        {section.items.map((item) => (
          <li
            key={item.key}
            className="border-b border-brand-border last:border-b-0"
          >
            <Link
              href={item.href}
              className="flex min-h-12 items-center gap-3 py-2 text-[15px] font-medium text-brand-ink hover:text-brand-primary"
            >
              <span className="flex-1">{item.label}</span>
              <ChevronRightIcon
                className="size-4 shrink-0 text-brand-neutral"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
