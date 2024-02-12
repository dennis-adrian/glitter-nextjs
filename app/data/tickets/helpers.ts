import { FestivalBase } from "@/app/api/festivals/definitions";
import { VisitorWithTickets } from "@/app/data/visitors/actions";
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

export async function sendEmail(
  festival: FestivalBase,
  visitor?: VisitorWithTickets | null,
) {
  if (!visitor) return;

  await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/send`, {
    body: JSON.stringify({
      visitor,
      festival,
    }),
    method: "POST",
  });
}
