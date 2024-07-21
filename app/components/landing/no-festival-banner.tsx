import LandingRedirectButton from "@/app/components/landing/redirect-button";
import Image from "next/image";

export default function NoFestivalBanner() {
  return (
    <div className="relative">
      <div className="relative p-6 flex flex-col items-center h-[415px]">
        {/* got this code for the background from nextjs image docs */}
        <Image
          className="-z-10 object-cover rounded-md md:hidden"
          alt="imagen de fondo"
          src="/img/landing/no-event-banner-938x415.png"
          quality={100}
          fill
          sizes="100vw"
        />
        <Image
          className="-z-10 object-cover rounded-md hidden md:block"
          alt="imagen de fondo"
          src="/img/landing/no-event-banner-1518x670.png"
          quality={100}
          fill
          sizes="100vw"
        />
        <section className="text-white flex flex-col items-center justify-center gap-4">
          <h1 className="text-3xl font-bold text-center md:text-5xl">
            Estamos preparando nuestro próximo evento
          </h1>
          <p className="text-center text-sm md:text-base">
            Si te gustaría participar en alguno de nuestros eventos pero aún no
            tienes un perfil Glitter, estás es tu oportunidad para crearte uno
          </p>
          <LandingRedirectButton
            className="text-base lg:text-lg"
            href="/sign_up"
          >
            Crear mi perfil Glitter
          </LandingRedirectButton>
        </section>
      </div>
      <Image
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
        alt="imagen de fondo"
        src="/img/glitter-mascot.png"
        height={252}
        width={200}
      />
    </div>
  );
}
