import BaseCard from "@/app/components/user_profile/announcements_cards/base-card";

export default function RejectedProfileCard() {
  return (
    <BaseCard
      className="bg-red-100 text-red-900 border-red-300 dark:bg-red-900/40 dark:text-red-100 dark:border-red-800"
      content="Tu perfil ha sido rechazado. Revisá tu correo electrónico para más información o contactate a soporte@productoraglitter.com."
    />
  );
}
