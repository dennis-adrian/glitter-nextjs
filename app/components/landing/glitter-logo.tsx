import Image from "next/image";

export default function GlitterLogo({
  variant = "light",
}: {
  variant?: "light" | "dark";
}) {
  return (
    <Image
      className="w-[100px] h-[32px] sm:w-[150px] sm:h-[48px]"
      src={
        variant === "dark"
          ? "/img/logo/logo-dark.png"
          : "/img/logo/logo-light.png"
      }
      alt="Glitter Logo"
      width={150}
      height={48}
    />
  );
}
