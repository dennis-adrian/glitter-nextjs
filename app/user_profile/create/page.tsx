import { currentUser } from '@clerk/nextjs';

import { londrinaSolid } from '@/ui/fonts';
import { createUserProfile, fetchUserProfile, isProfileCreated } from '@/app/api/users/actions';
import { redirect } from 'next/navigation';

export default async function UserProfileCreate() {
  const user = await currentUser();

  if (user) {
    if (await isProfileCreated(user)) {
      redirect('/user_profile');
    }
  }

  return (
    <div className="flex justify-center items-center h-full">
      <h1 className={`${londrinaSolid.className} text-4xl`}>
        ¡Bienvenido a Glitter!
      </h1>
    </div>
  );
}
