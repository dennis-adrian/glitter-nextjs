import { fn } from "storybook/test";

// Storybook-only substitutes: card dialogs never call the database.
export const fetchParticipationPreviewData = fn(async () => ({
  imageUrl: null,
  participantName: "Ilustración Demo",
  standLabels: ["A12"],
  sectorName: "Teatro",
}));

export const addFestivalActivityParticipantProof = fn(async () => ({
  success: true,
  message: "Diseño guardado (demo)",
}));
