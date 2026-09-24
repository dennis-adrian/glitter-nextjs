"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { BaseProfile } from "@/app/api/users/definitions";

export type DashboardViewer = {
  id: number;
  role: BaseProfile["role"];
};

const DashboardViewerContext = createContext<DashboardViewer | null>(null);

type Props = {
  /** Resolved on the server by the dashboard layout, which already reads it. */
  viewer: DashboardViewer;
  children: ReactNode;
};

/**
 * Makes the signed-in staff member available to the dashboard's client tree
 * without prop drilling through tables and cells.
 *
 * This is for rendering decisions only — showing a control as unavailable
 * before it is clicked. Every gated action re-checks the caller on the server.
 */
export default function DashboardViewerProvider({ viewer, children }: Props) {
  return (
    <DashboardViewerContext.Provider value={viewer}>
      {children}
    </DashboardViewerContext.Provider>
  );
}

/**
 * True when the viewer may run the profile lifecycle actions (verify, reject,
 * disable, delete, pause). Mirrors `requireAdmin()`, the gate those actions
 * use. Falls back to false with no provider mounted, so a control that depends
 * on it reads as unavailable rather than as working.
 */
export function useCanManageProfiles(): boolean {
  return useContext(DashboardViewerContext)?.role === "admin";
}
