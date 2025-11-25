import * as styles from "@/app/emails/styles";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { getFestivalLogo } from "@/app/lib/utils";
import { Img, Section } from "@react-email/components";

type EmailHeaderProps = {
	festivalType?: FestivalBase["festivalType"];
};
export default function EmailHeader({ festivalType }: EmailHeaderProps) {
	const src = getFestivalLogo(festivalType ?? "glitter");

	return (
		<Section style={styles.banner}>
			<Img style={{ margin: "0 auto" }} width={200} src={src} />
		</Section>
	);
}
