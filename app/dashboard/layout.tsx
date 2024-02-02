import { fetchUserProfile } from '@/app/api/users/actions';
import { currentUser } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await currentUser();

  if (!user) {
    redirect('/sign-in');
  }

  const data = await fetchUserProfile(user.id);
  const profile = data.user;

  if (profile && profile.role !== 'admin') {
    redirect('/');
  }

  return <div style={{ height: 'calc(100vh - 64px)' }}>{children}</div>;
}
