import { fetchReservations } from "@/app/api/reservations/actions";
import ProfileCell from "@/app/components/common/table/profile-cell";
import { ActionsCell } from "@/app/components/reservations/cells/actions";
import PaymentStatus from "@/app/components/reservations/cells/payment-status";
import { ReservationStatus } from "@/app/components/reservations/cells/status";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { HeaderCell } from "@/app/components/users/header-cell";
import { formatDate } from "@/app/lib/formatters";
import { DateTime } from "luxon";

type ReservationsTableProps = {
  query?: string;
  festivalId?: number;
};
export default async function ReservationsTable(props: ReservationsTableProps) {
  const reservations = await fetchReservations({
    ...props,
  });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <HeaderCell value="number" label="#" />
          <HeaderCell value="profile" label="Perfil" />
          <HeaderCell value="status" label="Estado de la Reserva" />
          <HeaderCell value="stand" label="Espacio" />
          <HeaderCell value="festivalName" label="Festival" />
          <HeaderCell value="paymentStatus" label="Estado de Pago" />
          <HeaderCell value="createdAt" label="Fecha de Creación" />
          <TableHead className="sticky right-0 z-20 bg-white shadow-inner"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reservations.length > 0 ? (
          reservations.map((reservation, index) => (
            <TableRow key={reservation.id}>
              <TableCell>{index + 1}</TableCell>
              <TableCell>
                <div className="flex flex-col gap-2">
                  {reservation.participants.map((participant) => (
                    <ProfileCell
                      key={participant.id}
                      profile={participant.user}
                    />
                  ))}
                </div>
              </TableCell>
              <TableCell>
                <ReservationStatus reservation={reservation} />
              </TableCell>
              <TableCell>
                {reservation.stand.label}
                {reservation.stand.standNumber}
              </TableCell>
              <TableCell>{reservation.festival.name}</TableCell>
              <TableCell>
                <PaymentStatus reservation={reservation} />
              </TableCell>
              <TableCell>
                {formatDate(reservation.createdAt).toLocaleString(
                  DateTime.DATETIME_SHORT_WITH_SECONDS,
                )}
              </TableCell>
              <TableCell>
                <ActionsCell reservation={reservation} />
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
