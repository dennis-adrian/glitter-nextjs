import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function PendingArtistCard({}) {
  return (
    <Card className="my-4 p-2 text-center">
      <CardHeader className="p-3">
        <CardTitle className="text-lg leading-6">
          Estamos considerando tu solicitud
        </CardTitle>
      </CardHeader>
      <CardContent className="">
        <p className="text-sm">
          Estamos considerando tu solicitud para ser parte de la comunidad de{" "}
          <strong>Glitter</strong> como artista. Te notificaremos cuando
          tengamos una respuesta.
        </p>
      </CardContent>
    </Card>
  );
}
