import * as styles from "@/app/emails/styles";
import { Button, Text } from "@react-email/components";

type DisciplinaryHistoryDetailsProps = {
  note?: string | null;
  noteLabel: string;
  historyPrompt: string;
  historyUrl: string;
  identifier: string;
};

export default function DisciplinaryHistoryDetails({
  note,
  noteLabel,
  historyPrompt,
  historyUrl,
  identifier,
}: DisciplinaryHistoryDetailsProps) {
  return (
    <>
      {note && (
        <>
          <Text style={styles.text}>
            <strong>{noteLabel}</strong>
          </Text>
          <Text style={styles.standoutText}>{note}</Text>
        </>
      )}
      <Text style={styles.text}>{historyPrompt}</Text>
      <Button href={historyUrl} style={styles.buttonWithBanner}>
        Ver mi historial
      </Button>
      <Text style={{ ...styles.textSmall, marginTop: "16px" }}>
        Referencia: {identifier}
      </Text>
    </>
  );
}
