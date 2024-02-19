import BaseCard from "./base-card";

export default async function PendingArtistCard() {
  return (
    <BaseCard
      title="Estamos considerando tu solicitud"
      content={
        <p className="mb-3">
          Gracias por querer ser parte de la comunidad de{" "}
          <strong>Glitter</strong> como artista. Cuando tu solicitud sea
          aceptada te enviaremos un correo
        </p>
      }
    />
  );
}
