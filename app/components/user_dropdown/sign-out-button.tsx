import { useClerk } from '@clerk/nextjs';
import { LogOutIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { DropdownMenuItem } from '@/app/components/ui/dropdown-menu';

const SignOutButton = () => {
  const { signOut } = useClerk();
  const router = useRouter();

  return (
    <DropdownMenuItem onClick={() => signOut(() => router.push('/'))}>
      <LogOutIcon className="mr-2 h-4 w-4" />
      <span>Cerrar Sesión</span>
    </DropdownMenuItem>
  );
};

export default SignOutButton;
