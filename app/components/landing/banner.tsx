import Image from "next/image";

export default function LandingBanner() {
  return (
    <div className="-z-10">
      <Image
        className="hidden md:block lg-rounded-md"
        alt="background image"
        src="/img/landing-banner-md.png"
        quality={100}
        fill
        style={{
          objectFit: "cover",
        }}
      />
      <Image
        className="md:hidden"
        alt="background image"
        src="/img/background-sm.png"
        quality={100}
        fill
        style={{
          objectFit: "cover",
        }}
      />
    </div>
  );
}
