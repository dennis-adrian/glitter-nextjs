import { SignUp } from '@clerk/nextjs';

export default function Page() {
  const afterActionUrl = '/user_profile/create';
  return (
    <div className="flex justify-center p-4">
      <SignUp afterSignInUrl={afterActionUrl} afterSignUpUrl={afterActionUrl} />
    </div>
  );
}
