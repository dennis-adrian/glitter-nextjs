import { collaborators } from "@/db/schema";

export type NewCollaborator = typeof collaborators.$inferInsert;
export type Collaborator = typeof collaborators.$inferSelect;
