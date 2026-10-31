import type { ReactElement } from "react";
import type { z } from "zod";

import type { NotificationCategory } from "@/app/lib/notifications/definitions";

export type InAppCopy = {
  title: string;
  body: string;
  actionPath: string | null;
  actionLabel: string | null;
};

export type EmailCopy = {
  from: string;
  subject: string;
  react: ReactElement;
};

export type KindDefinition<Data> = {
  category: NotificationCategory;
  schema: z.ZodType<Data>;
  inApp: (data: Data) => InAppCopy;
  /**
   * Absent for in-app-only kinds, including every phase 2 mirror: those
   * emails still go out through the outbox that queued them.
   */
  email?: (data: Data) => EmailCopy;
  /** Credits this moved, for the inbox's "+20". */
  creditDelta?: (data: Data) => number | null;
  /**
   * Whether tapping the item opens its own page instead of following its
   * action. True when it carries text someone wrote for this person (a gift's
   * message, a cancellation reason, a resolution note): the list cuts the body
   * to two lines, and the screen the action leads to may not show that text.
   */
  opensDetail?: (data: Data) => boolean;
  /**
   * Whether the item is written already read: a receipt for something the
   * person just did themselves ("Recibimos tu comprobante") belongs in their
   * history, but is not news worth a badge.
   */
  startsRead?: (data: Data) => boolean;
  /**
   * Whether it also goes to the person's devices as a push, for those who
   * turned avisos on. Participant news does; of the Administración copies,
   * only those asking an admin to act. A receipt that starts read never does.
   * `"per_send"`: only when whoever sent it asked (a comunicado's tick).
   */
  push?: true | "per_send";
  /**
   * Disciplinary notices. A push says only that something arrived, never
   * what, since it shows on a lock screen.
   */
  sensitive?: true;
};
