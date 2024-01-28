import { SignUp } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="flex justify-center p-4">
      <SignUp
        afterSignInUrl="/user_profile"
        afterSignUpUrl="/user_profile/create"
      />
    </div>
  );
}
