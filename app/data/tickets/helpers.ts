"use server";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
import { backendClient } from "@/app/lib/edgestore-server";

export async function uploadQrCode(qrCodeUrl: string) {
  const blobPromise = await fetch(qrCodeUrl);
  const blob = await blobPromise.blob();
  const uploadedFile = await backendClient.publicFiles.upload({
    content: {
      blob,
      extension: "png",
    },
  });
  return uploadedFile.url;
}
