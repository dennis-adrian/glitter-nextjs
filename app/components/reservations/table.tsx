import { fetchReservations } from "@/app/api/reservations/actions";
import ReservationStatusBadge from "@/app/components/atoms/reservation-status-badge";
import CategoryBadge from "@/app/components/category-badge";
import ProfileCell from "@/app/components/common/table/profile-cell";
import { ActionsCell } from "@/app/components/reservations/cells/actions";
import PaymentStatus from "@/app/components/reservations/cells/payment-status";
import { Avatar, AvatarImage } from "@/app/components/ui/avatar";
import { Badge } from "@/app/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/ui/table";
import { HeaderCell } from "@/app/components/users/header-cell";
import { getExternalParticipantCategoryLabel } from "@/app/lib/external_participants/definitions";
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
          <HeaderCell value="category" label="Categoría" />
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
                  {reservation.externalParticipants?.map(
                    ({ externalParticipant }) => (
                      <div
                        key={`external-${externalParticipant.id}`}
                        className="flex gap-2 items-center"
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarImage
                            src={
                              externalParticipant.imageUrl ||
                              "/img/placeholders/avatar-placeholder.png"
                            }
                            alt={
                              externalParticipant.displayName
                                ? `Imagen de ${externalParticipant.displayName}`
                                : "Imagen de participante externo"
                            }
                          />
                        </Avatar>
                        <div className="flex flex-col">
                          <span>
                            <span className="text-muted-foreground mr-1">
                              #{externalParticipant.id}
                            </span>
                            <span className="font-semibold mr-1">
                              {externalParticipant.displayName}
                            </span>
                          </span>
                          {externalParticipant.contactEmail && (
                            <span className="text-muted-foreground text-sm">
                              {externalParticipant.contactEmail}
                            </span>
                          )}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {reservation.participants.map((participant) => (
                    <CategoryBadge
                      key={`participant-category-${participant.id}`}
                      category={participant.user.category}
                    />
                  ))}
                  {reservation.externalParticipants?.map(
                    ({ externalParticipant }) => (
                      <Badge
                        key={`external-category-${externalParticipant.id}`}
                        variant="outline"
                        className="border-teal-600 text-teal-700 font-bold uppercase"
                      >
                        {getExternalParticipantCategoryLabel(
                          externalParticipant,
                        )}
                      </Badge>
                    ),
                  )}
                </div>
              </TableCell>
              <TableCell>
                <ReservationStatusBadge status={reservation.status} />
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
            <TableCell colSpan={9} className="h-24 text-center">
              Sin resultados
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
