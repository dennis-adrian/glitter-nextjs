import LandingRedirectButton from "@/app/components/landing/redirect-button";
import Image from "next/image";

export default function NoFestivalBanner() {
  return (
    <div className="relative">
      <div className="relative px-6 py-8 flex flex-col items-center min-h-[450px] md:min-h-[670px] mb-20">
        {/* got this code for the background from nextjs image docs */}
        <Image
          className="-z-10 object-cover rounded-md md:hidden"
          alt="imagen de fondo"
          src="/img/landing/no-event-landing-banner-393x415.png"
          quality={100}
          fill
          sizes="100vw"
        />
        <Image
          className="-z-10 object-cover rounded-md hidden md:block lg:hidden"
          alt="imagen de fondo"
          src="/img/landing/no-event-landing-banner-834x720.png"
          quality={100}
          fill
          sizes="100vw"
        />
        <Image
          className="-z-10 object-cover rounded-md hidden md:hidden lg:block"
          alt="imagen de fondo"
          src="/img/landing/no-event-landing-banner-1512x670.png"
          quality={100}
          fill
          sizes="100vw"
        />
        <section className="text-white flex flex-col items-center justify-center gap-4">
          <h1 className="text-3xl font-bold text-center md:text-6xl">
            Estamos preparando nuestro próximo evento
          </h1>
          <p className="text-center text-sm md:hidden">
            Si te gustaría participar en alguno de nuestros eventos pero aún no
            tienes un perfil Glitter, estás es tu oportunidad para crearte uno
          </p>
          <p className="text-center hidden md:block max-w-[520px] lg:max-w-[1000px] text-xl">
            Si te gustaría participar en alguno de nuestros eventos pero aún no
            tienes un perfil Glitter, estás es tu oportunidad para crearte uno
          </p>
          <LandingRedirectButton
            className="text-base lg:text-lg my-4"
            href="/sign_up"
          >
            Crear mi perfil Glitter
          </LandingRedirectButton>
        </section>
        <Image
          className="absolute -bottom-20 md:hidden"
          alt="imagen de fondo"
          src="/img/glitter-mascot.png"
          height={252}
          width={200}
        />
        <Image
          className="hidden md:block mt-8"
          alt="imagen de fondo"
          src="/img/glitter-mascot.png"
          height={252}
          width={200}
        />
      </div>
    </div>
  );
}
