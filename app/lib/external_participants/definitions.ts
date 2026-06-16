import { externalParticipants } from "@/db/schema";

export type ExternalParticipant = typeof externalParticipants.$inferSelect;
export type NewExternalParticipant = typeof externalParticipants.$inferInsert;
export type ExternalParticipantType = ExternalParticipant["type"];

export const externalParticipantTypeLabels: Record<
  ExternalParticipantType,
  string
> = {
  institution: "Institución",
  social_organization: "Organización social",
  sponsor: "Auspiciante",
  partner: "Aliado",
  public_entity: "Entidad pública",
  invited_brand: "Marca invitada",
  other: "Otro",
};

export const externalParticipantTypeOptions = Object.entries(
  externalParticipantTypeLabels,
).map(([value, label]) => ({ value, label }));

export function getExternalParticipantCategoryLabel(
  participant: Pick<ExternalParticipant, "type" | "customCategoryLabel">,
) {
  return (
    participant.customCategoryLabel?.trim() ||
    externalParticipantTypeLabels[participant.type]
  );
}
