import {
	Body,
	Button,
	Container,
	Head,
	Html,
	Preview,
	Section,
	Text,
} from "@react-email/components";
import * as styles from "@/app/emails/styles";
import EmailHeader from "@/app/emails/email-header";
import EmailFooter from "@/app/emails/email-footer";
import { BaseProfile } from "@/app/api/users/definitions";
import { FestivalBase } from "@/app/lib/festivals/definitions";
import { getUserName } from "@/app/lib/users/utils";
import type { ProofStatus } from "@/app/lib/festival_activites/types";

type ActivityProofReviewEmailProps = {
	profile: BaseProfile;
	festivalId: number;
	activityId: number;
	activityName: string;
	festivalName: string;
	status: Exclude<ProofStatus, "pending_review">;
	adminFeedback?: string | null;
	festivalType?: FestivalBase["festivalType"];
	materialLabel: string;
	materialArticle: "el" | "la";
	materialPastParticiple: "aprobado" | "aprobada";
};

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ActivityProofReviewEmail({
	profile,
	festivalId,
	activityId,
	activityName,
	festivalName,
	status,
	adminFeedback,
	festivalType = "glitter",
	materialLabel,
	materialArticle,
	materialPastParticiple,
}: ActivityProofReviewEmailProps) {
	const userName = getUserName(profile);
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
	const activityUrl = `${baseUrl}/profiles/${profile.id}/festivals/${festivalId}/activity/${activityId}`;

	const previews: Record<Exclude<ProofStatus, "pending_review">, string> = {
		approved: `¡Tu ${materialLabel} fue ${materialPastParticiple}!`,
		rejected_resubmit: `Tu ${materialLabel} necesita correcciones`,
		rejected_removed: "Has sido removido de la actividad",
	};

	return (
		<Html>
			<Head />
			<Preview>{previews[status]}</Preview>
			<Body style={styles.main}>
				<Container style={styles.container}>
					<EmailHeader festivalType={festivalType} />
					<Section style={styles.sectionWithBanner}>
						<Text style={styles.text}>¡Hola {userName}!</Text>

						{status === "approved" && (
							<>
								<Text style={styles.text}>
									¡{capitalize(materialArticle)} {materialLabel} que agregaste
									para la actividad <strong>{activityName}</strong> del festival{" "}
									<strong>{festivalName}</strong> fue {materialPastParticiple}!
								</Text>
								<Text style={styles.text}>
									Tu participación en la actividad está confirmada.
								</Text>
								<Button href={activityUrl} style={styles.buttonWithBanner}>
									Ver detalles
								</Button>
							</>
						)}

						{status === "rejected_resubmit" && (
							<>
								<Text style={styles.text}>
									{capitalize(materialArticle)} {materialLabel} que agregaste
									para la actividad <strong>{activityName}</strong> del festival{" "}
									<strong>{festivalName}</strong> necesita correcciones.
								</Text>
								{adminFeedback && (
									<Text style={styles.standoutText}>{adminFeedback}</Text>
								)}
								<Text style={styles.text}>
									Por favor ingresa al sitio web y súbelo nuevamente.
								</Text>
								<Button href={activityUrl} style={styles.buttonWithBanner}>
									Subir {materialLabel} nuevamente
								</Button>
							</>
						)}

						{status === "rejected_removed" && (
							<>
								<Text style={styles.text}>
									Has sido removido/a de la actividad{" "}
									<strong>{activityName}</strong> del festival{" "}
									<strong>{festivalName}</strong>.
								</Text>
								{adminFeedback && (
									<Text style={styles.standoutText}>{adminFeedback}</Text>
								)}
								<Button href={activityUrl} style={styles.buttonWithBanner}>
									Ver detalles
								</Button>
							</>
						)}
					</Section>
				</Container>
				<EmailFooter />
			</Body>
		</Html>
	);
}

ActivityProofReviewEmail.PreviewProps = {
	profile: { id: 1, displayName: "Pandora" },
	festivalId: 12,
	activityId: 34,
	activityName: "Mejor Stand Glitter",
	festivalName: "Glitter 10ma edición",
	festivalType: "glitter",
	status: "rejected_resubmit",
	adminFeedback: "La imagen no cumple con los requisitos de calidad mínima.",
	materialLabel: "foto del stand",
	materialArticle: "la",
	materialPastParticiple: "aprobada",
} as ActivityProofReviewEmailProps;
