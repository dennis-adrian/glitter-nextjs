import Image from "next/image";

export default function LandingBanner() {
  return (
    <>
      <Image
        className="absolute hidden -z-10 xl:block 2xl:rounded-lg object-cover"
        alt="background image"
        src="/img/landing-banner-xl.png"
        quality={100}
        fill
        sizes="100vw"
      />
      <Image
        className="hidden lg:block xl:hidden -z-10 object-cover"
        alt="background image"
        src="/img/landing-banner-lg.png"
        quality={100}
        fill
        sizes="100vw"
      />
      <Image
        className="absolute hidden md:block lg:hidden -z-10 object-cover"
        alt="background image"
        src="/img/landing-banner-md.png"
        quality={100}
        fill
        sizes="100vw"
      />
      <Image
        className="md:hidden -z-10 object-cover"
        alt="background image"
        src="/img/landing-banner-sm.png"
        quality={100}
        fill
        sizes="100vw"
      />
    </>
  );
}
