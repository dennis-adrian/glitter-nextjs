import Image from "next/image";

import { junegull } from "@/ui/fonts";

import LandingRedirectButton from "@/app/components/landing/redirect-button";
import { FestivalInfo } from "@/app/components/landing/festival-info-card";
import Carousel from "@/app/components/landing/carousel";
import EventFeatures from "@/app/components/landing/event-features";
import LandingBanner from "@/app/components/landing/banner";
import { RedirectButton } from "@/app/components/redirect-button";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";
import { getActiveFestival } from "@/app/lib/festivals/helpers";
import GeneralInfoDetails from "@/app/components/festivals/general-info-details";
import GeneralInfo from "@/app/components/festivals/general-info";

export default async function Home() {
  const festival = await getActiveFestival();

  return (
    <div className="container p-4 md:p-6">
      {festival && (
        <>
          <div className="relative p-4">
            {/* got this code for the background from nextjs image docs */}
            <Image
              className="-z-10 object-cover rounded-md brightness-50 md:hidden"
              alt="imagen de fondo"
              src="/img/twinkler/twinkler-banner-500x500.png"
              quality={100}
              fill
              sizes="100vw"
            />
            <Image
              className="-z-10 object-cover rounded-md brightness-50 hidden md:block"
              alt="imagen de fondo"
              src="/img/twinkler/twinkler-banner-1500x720.png"
              quality={100}
              fill
              sizes="100vw"
            />
            <Image
              className="mx-auto mt-4"
              alt="twinkler logo"
              src="/img/twinkler/twinkler-logo-white.png"
              height={80}
              width={270}
            />
            <div className="backdrop-blur-sm bg-white/60 m-4 rounded-md px-4">
              <GeneralInfoDetails
                className="pt-0"
                festival={festival}
                noMascot
              />
            </div>
            <div className="flex justify-center">
              {festival.publicRegistration ? (
                <div className="space-x-2 my-2">
                  <RedirectButton
                    variant="outline"
                    href={`/festivals/${festival.id}`}
                  >
                    Ver evento
                  </RedirectButton>
                  <RedirectButton
                    variant="cta"
                    href={`/festivals/${festival.id}/registration`}
                  >
                    Registrar asistencia
                  </RedirectButton>
                </div>
              ) : (
                <LandingRedirectButton
                  className="w-80"
                  festivalId={festival?.id}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
    // <div className="text-center text-lg md:text-2xl">
    //   <section className="container p-0">
    //     <div className="relative mx-auto flex flex-col">
    //       {festival && festival.mainBgUrl ? (
    //         <div className="-z-10 absolute h-[1440px] w-full max-w-[1500px] md:h-[420px]">
    //           <Image
    //             alt="background image"
    //             className="object-cover"
    //             objectFit=""
    //             fill
    //             src={festival.mainBgUrl}
    //           />
    //         </div>
    //       ) : (
    //         <LandingBanner />
    //       )}
    //       <div>
    //         <div>
    //           <div className="mt-2">
    //             <span className={junegull.className}>
    //               <h1 className="my-4 uppercase text-shadow-sm md:text-shadow text-4xl md:text-5xl text-white shadow-blue-950">
    //                 ¡Empecemos a brillar!
    //               </h1>
    //             </span>
    //           </div>
    //           {festival && (
    //             <div className="backdrop-blur-sm bg-black/5 px-4">
    //               <FestivalInfo festival={festival} />
    //             </div>
    //           )}
    //           {/* <div className="md:flex md:flex-col md:gap-2 hidden">
    //             <div className="text-white">
    //               <div className="text-xl md:text-3xl font-semibold">
    //                 Próximo Evento
    //               </div>
    //               {festival && (
    //                 <FestivalInfo
    //                   className="text-base max-w-sm py-2 md:py-4"
    //                   festival={festival}
    //                 />
    //               )}
    //             </div>
    //             {festival && festival.publicRegistration ? (
    //               <div className="space-x-2">
    //                 <RedirectButton
    //                   className="hover:bg-white"
    //                   variant="outline"
    //                   href={`/festivals/${festival.id}`}
    //                 >
    //                   Ver evento
    //                 </RedirectButton>
    //                 <RedirectButton
    //                   variant="cta"
    //                   href={`/festivals/${festival.id}/registration`}
    //                 >
    //                   Registrar asistencia
    //                 </RedirectButton>
    //               </div>
    //             ) : (
    //               <LandingRedirectButton
    //                 className="w-[320px]"
    //                 festivalId={festival?.id}
    //               />
    //             )}
    //           </div> */}
    //         </div>
    //         {/* <Image
    //           className="mx-auto hidden xl:block w-auto"
    //           src="/img/mascot-xl.png"
    //           alt="Mascota Glitter"
    //           width={617}
    //           height={670}
    //         />
    //         <Image
    //           className="mx-auto hidden lg:block xl:hidden w-auto"
    //           src="/img/mascot-lg.png"
    //           alt="Mascota Glitter"
    //           width={480}
    //           height={443}
    //         />
    //         <Image
    //           className="mx-auto lg:hidden w-auto"
    //           src="/img/mascot-sm.png"
    //           alt="Mascota Glitter"
    //           width={327}
    //           height={327}
    //         /> */}
    //       </div>
    //     </div>
    //   </section>
    //   <section className="container p-0">
    //     <div className="relative flex flex-col md:py-10">
    //       {/* <Image
    //         className="hidden md:block -z-10 object-cover"
    //         alt="background image"
    //         src="/img/landing/landing-banner-lg-2.png"
    //         quality={100}
    //         fill
    //         sizes="100vw"
    //       />
    //       <Image
    //         className="sm:hidden -z-10 object-cover"
    //         alt="background image"
    //         src="/img/landing/landing-banner-sm-2.png"
    //         quality={100}
    //         fill
    //         sizes="100vw"
    //       /> */}
    //       {/* <div className="rounded-md flex-col gap-2 items-center w-full md:hidden"> */}
    //       <div>
    //         {/* <div>
    //           <div className="text-3xl font-semibold my-2">Próximo Evento</div>
    //           {festival && (
    //             <FestivalInfo className="py-2" festival={festival} />
    //           )}
    //         </div> */}
    //         {festival && festival.publicRegistration ? (
    //           <div className="space-x-2 my-2">
    //             <RedirectButton
    //               variant="outline"
    //               href={`/festivals/${festival.id}`}
    //             >
    //               Ver evento
    //             </RedirectButton>
    //             <RedirectButton
    //               variant="cta"
    //               href={`/festivals/${festival.id}/registration`}
    //             >
    //               Registrar asistencia
    //             </RedirectButton>
    //           </div>
    //         ) : (
    //           <LandingRedirectButton
    //             className="w-[320px]"
    //             festivalId={festival?.id}
    //           />
    //         )}
    //       </div>
    //       <div className="mt-8">
    //         <div className="px-3">
    //           <h1 className="text-4xl font-bold md:text-6xl text-shadow-sm shadow-primary-200">
    //             Esto es el Festival Glitter
    //           </h1>
    //           <p className="my-2 leading-6">
    //             un evento creado para brindar un espacio acogedor y seguro para
    //             artistas
    //           </p>
    //         </div>
    //         <div className="pt-4 md:pt-8">
    //           <Carousel />
    //         </div>
    //         <div className="px-3 py-4 md:py-14 md:px-6">
    //           <h1 className="text-4xl font-bold md:text-6xl text-shadow-sm shadow-gray-400 my-6 md:my-0">
    //             El mejor lugar para encontrar
    //           </h1>
    //           <EventFeatures />
    //         </div>
    //       </div>
    //     </div>
    //   </section>
    // </div>
  );
}
