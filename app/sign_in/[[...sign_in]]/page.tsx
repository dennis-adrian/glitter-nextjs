import { SignIn } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="flex justify-center p-4">
      <SignIn
        afterSignUpUrl="/user_profile/create"
        afterSignInUrl="/user_profile"
      />
    </div>
  );
}
