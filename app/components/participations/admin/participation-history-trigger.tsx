"use client";

import { Loader2Icon } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { ParticipationHistoryEntries } from "@/app/components/participations/admin/participation-history-list";
import { Button, buttonVariants } from "@/app/components/ui/button";
import {
  DrawerDialog,
  DrawerDialogClose,
  DrawerDialogContent,
  DrawerDialogDescription,
  DrawerDialogFooter,
  DrawerDialogHeader,
  DrawerDialogTitle,
  DrawerDialogTrigger,
} from "@/app/components/ui/drawer-dialog";
import { useMediaQuery } from "@/app/hooks/use-media-query";
import {
  groupParticipationHistoryByFestival,
  participationHistorySummary,
  type AdminFestivalParticipation,
} from "@/app/lib/participations/admin-history";
import { fetchParticipationHistoryAction } from "@/app/lib/participations/admin-history-actions";

type HistoryState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; groups: AdminFestivalParticipation[] }
  | { kind: "failed" };

/**
 * The participants table's "Participaciones" count, opening the account's
 * history: a dialog on desktop, a drawer on a phone.
 *
 * The history loads when it opens, not with the table, so a page of
 * participants costs nothing extra. Read-only apart from each reservation's
 * own link: moving one to another account happens on the account's page,
 * which it links to, so the transfer's dialog never stacks on this one.
 */
export default function ParticipationHistoryTrigger({
  userId,
  userName,
  count,
}: {
  userId: number;
  userName: string;
  /** Festivals with an accepted reservation, as the table counts them. */
  count: number;
}) {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<HistoryState>({ kind: "idle" });
  // Only the load started by the latest opening may publish.
  const loadRun = useRef(0);

  async function load() {
    const run = ++loadRun.current;
    setState({ kind: "loading" });
    try {
      const rows = await fetchParticipationHistoryAction({ userId });
      if (run !== loadRun.current) return;
      setState(
        rows
          ? { kind: "ready", groups: groupParticipationHistoryByFestival(rows) }
          : { kind: "failed" },
      );
    } catch (error) {
      console.error("Error loading participation history", error);
      if (run === loadRun.current) setState({ kind: "failed" });
    }
  }

  return (
    <DrawerDialog
      isDesktop={isDesktop}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
        else loadRun.current += 1;
      }}
    >
      {/* A real trigger, so closing hands focus back to this count. Padded
          past the digit so a phone has something to tap, pulled back so the
          number still lines up with the column. */}
      <DrawerDialogTrigger isDesktop={isDesktop}>
        <Button
          type="button"
          variant="link"
          size="inline"
          className="-mx-2 min-h-8 min-w-8 px-2 py-1 font-medium"
          aria-label={`Ver el historial de participaciones de ${userName}: ${count}`}
        >
          {count}
        </Button>
      </DrawerDialogTrigger>

      <DrawerDialogContent
        isDesktop={isDesktop}
        className="sm:max-w-2xl"
        // A read-only view with nothing to lose: tapping outside closes it.
        onPointerDownOutside={() => {}}
        onInteractOutside={() => {}}
      >
        <DrawerDialogHeader isDesktop={isDesktop}>
          <DrawerDialogTitle
            isDesktop={isDesktop}
            className="text-left wrap-anywhere"
          >
            Participaciones de {userName}
          </DrawerDialogTitle>
          <DrawerDialogDescription isDesktop={isDesktop} className="text-left">
            {state.kind === "ready"
              ? participationHistorySummary(state.groups)
              : "Cada festival cuenta una vez, aunque haya tenido más de una reserva."}
          </DrawerDialogDescription>
        </DrawerDialogHeader>

        <div
          className={`max-h-[65vh] overflow-y-auto ${isDesktop ? "" : "px-4"}`}
        >
          {state.kind === "ready" ? (
            <ParticipationHistoryEntries
              groups={state.groups}
              userId={userId}
              userName={userName}
              canTransfer={false}
            />
          ) : state.kind === "failed" ? (
            <div className="flex flex-col items-start gap-2 py-4 text-sm">
              <p className="text-destructive">
                No pudimos cargar el historial.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={load}>
                Reintentar
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2Icon className="h-4 w-4 animate-spin" />
              Cargando historial…
            </p>
          )}
        </div>

        <div
          className={`flex flex-wrap gap-2 ${isDesktop ? "justify-end" : "px-4 pt-2"}`}
        >
          <Link
            href={`/dashboard/users/${userId}`}
            className={buttonVariants({
              variant: "outline",
              size: "sm",
              wrap: true,
            })}
          >
            Ver perfil completo
          </Link>
        </div>
        <DrawerDialogFooter isDesktop={isDesktop} className="pt-2">
          <DrawerDialogClose isDesktop={isDesktop}>
            <Button variant="outline">Cerrar</Button>
          </DrawerDialogClose>
        </DrawerDialogFooter>
      </DrawerDialogContent>
    </DrawerDialog>
  );
}
