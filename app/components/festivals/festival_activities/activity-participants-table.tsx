"use client";

import { useEffect, useRef } from "react";
import { formatDisplayDate } from "@/app/lib/formatters";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/app/components/ui/badge";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { DataTable } from "@/app/components/ui/data_table/data-table";
import {
  ActivityDetailsWithParticipants,
  ParticipantWithUserAndProofs,
} from "@/app/lib/festivals/definitions";
import { getCategoryLabel } from "@/app/lib/maps/helpers";
import ProofImageModal from "./proof-image-modal";
import TextProofModal from "./text-proof-modal";
import MoveParticipantVariantMenu, {
  takeUnclaimedFocusAfterMove,
  type MoveTargetVariant,
} from "./move-participant-variant-menu";

type ParticipantWithDetail = ParticipantWithUserAndProofs & {
  detail: ActivityDetailsWithParticipants;
};

type ParticipantProof = ParticipantWithUserAndProofs["proofs"][number];

function getPrimaryProof(
  proofs: ParticipantWithUserAndProofs["proofs"],
): ParticipantProof | undefined {
  const imageProof = proofs.find((proof) => Boolean(proof.imageUrl));
  if (imageProof) return imageProof;

  const textProof = proofs.find(
    (proof) =>
      Boolean(proof.promoDescription && proof.promoDescription.trim()) ||
      Boolean(proof.promoConditions && proof.promoConditions.trim()),
  );
  return textProof;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function ParticipantProofViewer({
  proof,
  participantName,
  materialLabel,
}: {
  proof: ParticipantProof;
  participantName: string;
  materialLabel: string;
}) {
  const hasImage = Boolean(proof.imageUrl);
  const hasText =
    Boolean(proof.promoDescription && proof.promoDescription.trim()) ||
    Boolean(proof.promoConditions && proof.promoConditions.trim());

  if (hasImage && hasText) {
    return (
      <>
        <ProofImageModal
          imageUrl={proof.imageUrl}
          participantName={participantName}
          materialLabel={materialLabel}
        />
        <TextProofModal
          participantName={participantName}
          promoHighlight={proof.promoHighlight}
          promoDescription={proof.promoDescription}
          promoConditions={proof.promoConditions}
          materialLabel={materialLabel}
        />
      </>
    );
  }

  if (hasImage) {
    return (
      <ProofImageModal
        imageUrl={proof.imageUrl}
        participantName={participantName}
        materialLabel={materialLabel}
      />
    );
  }

  if (!hasText) return null;

  return (
    <TextProofModal
      participantName={participantName}
      promoHighlight={proof.promoHighlight}
      promoDescription={proof.promoDescription}
      promoConditions={proof.promoConditions}
      materialLabel={materialLabel}
    />
  );
}

/** Synthetic key when the participant has not submitted a proof row yet. */
const PROOF_STATUS_BADGE: Record<string, { label: string; className: string }> =
  {
    sin_prueba: {
      label: "Sin material",
      className:
        "text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-300 dark:border-amber-800 dark:bg-amber-950/40",
    },
    pending_review: {
      label: "En revisión",
      className:
        "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
    },
    approved: {
      label: "Aprobada",
      className:
        "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-900",
    },
    rejected_resubmit: {
      label: "Corrección solicitada",
      className:
        "bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800",
    },
    rejected_removed: {
      label: "Removido",
      className:
        "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800",
    },
  };

function proofStatusKey(proof: ParticipantProof | undefined) {
  return proof?.proofStatus ?? "sin_prueba";
}

function ParticipantMoveMenu({
  activityId,
  participant,
  variants,
}: {
  activityId: number;
  participant: ParticipantWithDetail;
  variants: MoveTargetVariant[];
}) {
  if (participant.removedAt != null || variants.length < 2) return null;
  return (
    <MoveParticipantVariantMenu
      activityId={activityId}
      participationId={participant.id}
      participantName={participant.user.displayName ?? "Participante"}
      participantCategory={participant.user.category ?? null}
      currentDetailId={participant.detail.id}
      variants={variants}
    />
  );
}

function buildColumns(
  materialLabel: string,
  activityId: number,
  variants: MoveTargetVariant[],
): ColumnDef<ParticipantWithDetail>[] {
  const columnTitleLabel = capitalize(materialLabel);

  return [
    {
      id: "index",
      header: "#",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">{row.index + 1}</span>
      ),
      size: 40,
    },
    {
      id: "participant",
      header: "Participante",
      accessorFn: (row) => row.user.displayName ?? "",
      cell: ({ row }) => {
        const user = row.original.user;
        return (
          <div className="flex items-center gap-2">
            <Avatar className="w-7 h-7 shrink-0">
              <AvatarImage
                src={
                  user.imageUrl || "/img/placeholders/avatar-placeholder.png"
                }
                alt={user.displayName ?? "Avatar"}
              />
            </Avatar>
            <span className="font-medium text-sm min-w-36 max-w-64 break-words wrap-anywhere">
              {user.displayName ?? "—"}
            </span>
          </div>
        );
      },
    },
    {
      id: "category",
      header: "Categoría",
      accessorFn: (row) => {
        const cat = row.detail.category;
        return cat ? getCategoryLabel(cat) : "Todas";
      },
      cell: ({ getValue }) => (
        <span className="text-sm text-muted-foreground">
          {getValue() as string}
        </span>
      ),
      filterFn: "equalsString",
    },
    {
      id: "enrolledAt",
      header: "Inscrito el",
      accessorFn: (row) => row.createdAt,
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {formatDisplayDate(new Date(row.original.createdAt), {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      ),
      sortingFn: "datetime",
    },
    {
      id: "proof",
      header: columnTitleLabel,
      accessorFn: (row) => proofStatusKey(getPrimaryProof(row.proofs)),
      cell: ({ row }) => {
        const proof = getPrimaryProof(row.original.proofs);
        const key = proofStatusKey(proof);
        const config = PROOF_STATUS_BADGE[key] ?? PROOF_STATUS_BADGE.sin_prueba;
        const label =
          key === "sin_prueba" ? `Sin ${materialLabel}` : config.label;
        return (
          <div>
            <Badge variant="outline" className={`text-xs ${config.className}`}>
              {label}
            </Badge>
            {row.original.removedAt != null && row.original.removalReason && (
              <p className="text-xs text-muted-foreground mt-0.5 italic">
                {row.original.removalReason}
              </p>
            )}
          </div>
        );
      },
      filterFn: (row, _, filterValue) => {
        const selected = filterValue as string[] | undefined;
        if (!selected?.length) return true;
        const key = proofStatusKey(getPrimaryProof(row.original.proofs));
        return selected.includes(key);
      },
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const proof = getPrimaryProof(row.original.proofs);
        return (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {proof && (
              <ParticipantProofViewer
                proof={proof}
                participantName={
                  row.original.user.displayName ?? "Participante"
                }
                materialLabel={materialLabel}
              />
            )}
            <ParticipantMoveMenu
              activityId={activityId}
              participant={row.original}
              variants={variants}
            />
          </div>
        );
      },
    },
  ];
}

type ActivityParticipantsTableProps = {
  activityId: number;
  /** The variant these participants are in. */
  detailId: number;
  /** Names the table for screen readers when it takes focus after a move. */
  label: string;
  participants: ParticipantWithDetail[];
  materialLabel: string;
  /** Every variant of the activity; with two or more, rows can be moved. */
  variants?: MoveTargetVariant[];
};

export default function ActivityParticipantsTable({
  activityId,
  detailId,
  label,
  participants,
  materialLabel,
  variants = [],
}: ActivityParticipantsTableProps) {
  const columns = buildColumns(materialLabel, activityId, variants);
  const columnTitleLabel = capitalize(materialLabel);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A participant moved in here whose row is hidden by this table's
    // filter, search or page: no row took focus, so the table does, rather
    // than leaving keyboard users at the page start.
    if (
      !takeUnclaimedFocusAfterMove(
        detailId,
        participants.map((p) => p.id),
      )
    ) {
      return;
    }
    if (!document.activeElement || document.activeElement === document.body) {
      containerRef.current?.focus();
    }
  }, [detailId, participants]);

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label={label}
      tabIndex={-1}
      className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {participants.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          No hay participantes inscriptos aún.
        </p>
      ) : (
        <ParticipantsList
          activityId={activityId}
          participants={participants}
          materialLabel={materialLabel}
          variants={variants}
          columns={columns}
          columnTitleLabel={columnTitleLabel}
        />
      )}
    </div>
  );
}

function ParticipantsList({
  activityId,
  participants,
  materialLabel,
  variants,
  columns,
  columnTitleLabel,
}: {
  activityId: number;
  participants: ParticipantWithDetail[];
  materialLabel: string;
  variants: MoveTargetVariant[];
  columns: ColumnDef<ParticipantWithDetail>[];
  columnTitleLabel: string;
}) {
  return (
    <>
      {/* Desktop: DataTable */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={participants}
          columnTitles={{
            "#": "#",
            participant: "Participante",
            category: "Categoría",
            enrolledAt: "Inscrito el",
            proof: columnTitleLabel,
            actions: "Acciones",
          }}
          filters={[
            {
              columnId: "proof",
              label: columnTitleLabel,
              options: [
                { value: "sin_prueba", label: `Sin ${materialLabel}` },
                { value: "pending_review", label: "En revisión" },
                { value: "approved", label: "Aprobada" },
                {
                  value: "rejected_resubmit",
                  label: "Corrección solicitada",
                },
                { value: "rejected_removed", label: "Removido" },
              ],
            },
          ]}
        />
      </div>

      {/* Mobile: stacked cards */}
      <div className="md:hidden space-y-2">
        {participants.map((participant, index) => {
          const proof = getPrimaryProof(participant.proofs);
          const statusKey = proofStatusKey(proof);
          const statusConfig =
            PROOF_STATUS_BADGE[statusKey] ?? PROOF_STATUS_BADGE.sin_prueba;
          const statusLabel =
            statusKey === "sin_prueba"
              ? `Sin ${materialLabel}`
              : statusConfig.label;
          const category = participant.detail.category;

          return (
            <div
              key={participant.id}
              className="flex flex-col gap-2 rounded-md border p-3"
            >
              {/* Name gets the full width; status and actions wrap below it,
                  so a phone never squeezes the name to nothing. */}
              <div className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground shrink-0 pt-2">
                  {index + 1}
                </span>
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarImage
                    src={
                      participant.user.imageUrl ||
                      "/img/placeholders/avatar-placeholder.png"
                    }
                    alt={participant.user.displayName ?? "Avatar"}
                  />
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium break-words wrap-anywhere">
                    {participant.user.displayName ?? "—"}
                  </p>
                  {category && (
                    <p className="text-xs text-muted-foreground">
                      {getCategoryLabel(category)}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pl-[3.25rem]">
                <Badge
                  variant="outline"
                  className={`text-xs ${statusConfig.className}`}
                >
                  {statusLabel}
                </Badge>
                {proof && (
                  <ParticipantProofViewer
                    proof={proof}
                    participantName={
                      participant.user.displayName ?? "Participante"
                    }
                    materialLabel={materialLabel}
                  />
                )}
                <ParticipantMoveMenu
                  activityId={activityId}
                  participant={participant}
                  variants={variants}
                />
              </div>
              {participant.removedAt != null && participant.removalReason && (
                <p className="text-xs text-muted-foreground italic break-words pl-[3.25rem]">
                  {participant.removalReason}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
