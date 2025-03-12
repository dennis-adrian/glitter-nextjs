import * as styles from "@/app/emails/styles";
import { Img, Section } from "@react-email/components";

type EmailHeaderProps = {
  festivalType?: "glitter" | "twinkler" | "festicker";
};
export default function EmailHeader({ festivalType }: EmailHeaderProps) {
  let src = "https://utfs.io/f/e6820207-3eb1-43fd-b140-d00184fd8182-e81rey.png";
  if (festivalType === "twinkler") {
    src = "https://utfs.io/f/1bbcf7ce-bdb5-40b9-a4b7-4db4e40628b0-xs2n0i.png";
  }
  return (
    <Section style={styles.banner}>
      <Img style={{ margin: "0 auto" }} width={170} src={src} />
    </Section>
  );
}
