"use client";

import { ParticipationWithParticipantAndReservations } from "@/app/api/users/definitions";
import ProfileCell from "@/app/components/common/table/profile-cell";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { DataTableColumnHeader } from "@/app/components/ui/data_table/column-header";
import { Checkbox } from "@radix-ui/react-checkbox";
import { ColumnDef } from "@tanstack/react-table";

export const columnTitles = {
  participant: "Participantes",
};

export const columns: ColumnDef<ParticipationWithParticipantAndReservations>[] =
  [
    {
      id: "participant",
      accessorFn: (participant) =>
        participant.user.displayName ||
        `${participant.user.firstName} ${participant.user.lastName}`,
      header: ({ column }) => (
        <DataTableColumnHeader
          column={column}
          title={columnTitles.participant}
        />
      ),
      cell: ({ row }) => <ProfileCell profile={row.original.user} />,
    },
  ];
