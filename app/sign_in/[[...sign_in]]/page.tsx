import { SignIn } from '@clerk/nextjs';

export default function Page() {
  const afterActionUrl = '/user_profile/create';
  return (
    <div className="flex justify-center p-4">
      <SignIn afterSignUpUrl={afterActionUrl} afterSignInUrl={afterActionUrl} />
    </div>
  );
}
