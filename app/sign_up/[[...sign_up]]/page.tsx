import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="flex justify-center items-center px:3 md:py-6 py-4 h-full">
      <SignUp />
    </div>
  );
}
