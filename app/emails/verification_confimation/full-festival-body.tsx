import { UserCategory } from "@/app/api/users/definitions";
import {
  FestivalBase,
  FestivalWithDates,
} from "@/app/data/festivals/definitions";
import * as styles from "@/app/emails/styles";
import { formatFullDate } from "@/app/lib/formatters";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { Button, Link, Text } from "@react-email/components";

type FullFestivalBodyProps = {
  baseUrl: string;
  category: UserCategory;
  festival: FestivalWithDates;
};

export default function FullFestivalBody(props: FullFestivalBodyProps) {
  return (
    <>
      <Text style={styles.text}>
        El festival <strong>{props.festival.name}</strong> se acerca.
        Lastimosamente de momento todos los espacios a los que podrías acceder
        están reservados.
      </Text>
      <Text style={styles.text}>
        Pero no te preocupes, cuando lancemos un nuevo evento con espacio para{" "}
        <strong>
          {getCategoryOccupationLabel(props.category, { singular: false })}{" "}
        </strong>
        serás de los primeros en recibir una notificación para hacer tu reserva.
      </Text>
      <Text style={styles.text}>
        De todas maneras, te invitamos a conocer todos los participantes del
        evento y a visitarnos el{" "}
        {formatFullDate(props.festival.festivalDates[0]?.startDate)}
      </Text>
      <Button
        href={`${props.baseUrl}/festivals/${props.festival.id}`}
        style={styles.button}
      >
        Ir al evento
      </Button>
    </>
  );
}
