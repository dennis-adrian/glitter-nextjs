import { handler, edgeStoreRouter } from "@/lib/edgestore-server";

export {
  /* @next-codemod-ignore `handler` export is re-exported. Check if this component uses `params` or `searchParams`*/
  handler as GET /* @next-codemod-ignore `handler` export is re-exported. Check if this component uses `params` or `searchParams`*/,
  handler as POST,
};

/**
 * This type is used to create the type-safe client for the frontend.
 */
export type EdgeStoreRouter = typeof edgeStoreRouter;
