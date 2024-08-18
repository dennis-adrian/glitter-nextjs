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
};
export default function UsersTableComponent(props: UsersTableProps) {
  return (
    <Table className="border">
      <TableHeader>
        <TableRow>
          <TableHead>Perfil</TableHead>
          <TableHead>Categoría</TableHead>
          <TableHead>Estado del perfil</TableHead>
          <TableHead>Fecha de verificación</TableHead>
          <TableHead>Fecha de creación</TableHead>
          <TableHead className="sticky right-0 z-20 bg-white shadow-inner"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {props.users?.length ? (
          props.users.map((user) => (
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
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={6} className="h-24 text-center">
              Sin resultados
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
