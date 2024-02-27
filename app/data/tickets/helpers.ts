import { backendClient } from "@/app/lib/edgestore-server";

export async function uploadQrCode(qrCodeUrl: string) {
  const blobPromise = await fetch(qrCodeUrl);
  const blob = await blobPromise.blob();
  const file = new File([blob], "ticket-qrcode.png", { type: "image/png" });
  const uploadedFile = await backendClient.publicFiles.upload({
    content: {
      blob: file,
      extension: "png",
    },
  });
  return uploadedFile.url;
}
