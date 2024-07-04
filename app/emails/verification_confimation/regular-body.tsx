import { UserCategory } from "@/app/api/users/definitions";
import * as styles from "@/app/emails/styles";
import { getCategoryOccupationLabel } from "@/app/lib/maps/helpers";
import { Button, Text } from "@react-email/components";

type RegularBodyProps = {
  category: UserCategory;
  baseUrl: string;
};

export default function RegularBody(props: RegularBodyProps) {
  return (
    <>
      <Text style={styles.text}>
        Cuando lancemos un nuevo evento con espacio para{" "}
        <strong>
          {getCategoryOccupationLabel(props.category, { singular: false })}{" "}
        </strong>
        recibirás una notificación para hacer tu reserva.
      </Text>
      <Text style={styles.text}>
        ¡No te olvides seguir nuestras redes para enterarte sobre nuevos
        eventos!
      </Text>
      <Text style={styles.text}>
        Y recuerda que siempre puedes visitar nuestra página y ver si tenemos
        novedades.
      </Text>
      <Button href={props.baseUrl} style={styles.button}>
        Ir a la página web
      </Button>
    </>
  );
}
