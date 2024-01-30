import BaseCard from "./base-card";

export default async function PendingArtistCard() {
  return (
    <BaseCard
      title="Estamos considerando tu solicitud"
      content={
        <p>
          Gracias por querer ser parte de la comunidad de{" "}
          <strong>Glitter</strong> como artista. Cuando tu solicitud sea
          aceptada podrás postularte a cualquier evento
        </p>
      }
    />
  );
}
