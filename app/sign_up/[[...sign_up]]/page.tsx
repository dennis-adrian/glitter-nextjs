import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex justify-center my-4 md:absolute md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2">
      <SignUp />
    </div>
  );
}
