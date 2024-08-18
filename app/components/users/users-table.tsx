"use client";

import { ProfileType } from "@/app/api/users/definitions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import ProfileCategoryBadge from "@/app/components/user_profile/category-badge";
import { ActionsCell } from "@/app/components/users/cells/actions";
import ProfileStatusCell from "@/app/components/users/cells/profile-status";
import UserInfoCell from "@/app/components/users/cells/user-info";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

type UsersTableProps = {
  users: ProfileType[];
  status?: "complete" | "missingFields";
  columnVisbility?: Record<string, boolean>;
};
export default function UsersTableComponent(props: UsersTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <TableCell>Perfil</TableCell>
          </TableHead>
          <TableHead>
            <TableCell>Categoría</TableCell>
          </TableHead>
          <TableHead>
            <TableCell>Estado del perfil</TableCell>
          </TableHead>
          <TableHead>
            <TableCell>Fecha de verificación</TableCell>
          </TableHead>
          <TableHead>
            <TableCell>Fecha de creación</TableCell>
          </TableHead>
          <TableHead className="sticky right-0 z-20 bg-white shadow-inner">
            <TableCell>Acciones</TableCell>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.users.map((user) => (
          <TableRow key={user.id}>
            <TableCell>
              <UserInfoCell profile={user} />
            </TableCell>
            <TableCell>
              <ProfileCategoryBadge profile={user} />
            </TableCell>
            <TableCell>
              <ProfileStatusCell status={user.status} />
            </TableCell>
            <TableCell>
              {user.verifiedAt
                ? formatDate(user.verifiedAt).toLocaleString(
                    DateTime.DATETIME_SHORT,
                  )
                : "--"}
            </TableCell>
            <TableCell>
              {formatDate(user.createdAt).toLocaleString(
                DateTime.DATETIME_SHORT,
              )}
            </TableCell>
            <TableCell className="sticky right-0 z-20 bg-white shadow-inner">
              <ActionsCell user={user} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
