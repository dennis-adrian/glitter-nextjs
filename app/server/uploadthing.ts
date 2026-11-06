import { UTApi } from "uploadthing/server";

import { refuseDuringView } from "@/db/write-guard";

/**
 * The UTApi calls that change what UploadThing stores. While an admin views
 * the app as a participant (docs/PLAN-impersonation.md §6.2) each one is
 * refused before it reaches UploadThing, whichever action calls it and
 * whether or not a database write follows. Reads (listing files, signed
 * URLs, usage) pass through.
 */
const MUTATIONS = new Set<PropertyKey>([
  "uploadFiles",
  "uploadFilesFromUrl",
  "deleteFiles",
  "renameFiles",
  "updateACL",
]);

/** Guards `api`'s mutating calls with `refuseDuringView`. */
export function guardUTApi<T extends object>(api: T): T {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (!MUTATIONS.has(property) || typeof value !== "function") {
        return value;
      }
      return async (...args: unknown[]) => {
        await refuseDuringView();
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
}

export const utapi = guardUTApi(new UTApi());
