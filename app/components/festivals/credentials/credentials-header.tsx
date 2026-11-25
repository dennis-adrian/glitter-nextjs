"use client";

import { DownloadIcon } from "lucide-react";
import type { ReactNode } from "react";

import { useCredentials } from "@/app/components/festivals/credentials/credentials-context";
import PageBreadcrumbs from "@/app/components/navbar/page-breadcrumbs";
import { buttonVariants } from "@/app/components/ui/button";
import {
  credentialsExportPath,
  CREDENTIALS_COPY,
} from "@/app/lib/credentials/definitions";
import { cn } from "@/app/lib/utils";

/**
 * Breadcrumbs, the title and the page's two actions. The title carries
 * `data-installed-title` so the installed app, whose top bar already names
 * the screen, does not show it twice.
 */
export default function CredentialsHeader({
  printAction,
}: {
  /** "Marcar como enviadas a imprenta", once print batches exist. */
  printAction?: ReactNode;
}) {
  const { festivalId, festivalName, filters } = useCredentials();
  return (
    <div className="flex flex-col gap-3">
      <PageBreadcrumbs
        labels={{ [`/dashboard/festivals/${festivalId}`]: festivalName }}
      />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-1">
          <h1
            data-installed-title=""
            className="font-display text-2xl font-bold md:text-3xl"
          >
            {CREDENTIALS_COPY.title}
          </h1>
          <p className="text-sm text-muted-foreground">{CREDENTIALS_COPY.subtitle}</p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          {/* A plain link: the browser downloads the file. */}
          <a
            href={credentialsExportPath(festivalId, filters)}
            className={cn(buttonVariants({ variant: "outline", wrap: true }))}
          >
            <DownloadIcon className="mr-2 h-4 w-4 shrink-0" aria-hidden />
            {CREDENTIALS_COPY.exportCsv}
          </a>
          {printAction}
        </div>
      </div>
    </div>
  );
}
