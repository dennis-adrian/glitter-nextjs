import { useClerk } from "@clerk/nextjs";
import { LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";

import { prepareSignOut } from "@/app/components/impersonation/view-state";
import { DropdownMenuItem } from "@/app/components/ui/dropdown-menu";

const SignOutButton = () => {
  const { signOut } = useClerk();
  const router = useRouter();

  return (
    <DropdownMenuItem
      onClick={async () => {
        // Ends a view of the app as someone else first, then forgets this
        // browser's avisos for whoever is really signed in.
        await prepareSignOut();
        await signOut(() => router.push("/"));
      }}
    >
      <LogOutIcon className="mr-2 h-4 w-4" />
      <span>Cerrar Sesión</span>
    </DropdownMenuItem>
  );
};

export default SignOutButton;
