"use client";

import { ProfileType } from "@/app/api/users/definitions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/app/components/ui/dialog";
import { getMissingProfileFieldsKeys } from "@/app/lib/utils";
import { Subcategory } from "@/app/lib/subcategories/definitions";
import { use } from "react";
import Categories from "@/app/components/user_profile/creation-process/categories";

type CompleteProfileModalProps = {
  children?: React.ReactNode;
  profile: ProfileType;
  open?: boolean;
  subcategoriesPromise: Promise<Subcategory[]>;
};

export default function CompleteProfileModal({
  children,
  open,
  profile,
  subcategoriesPromise,
}: CompleteProfileModalProps) {
  // TODO: The modal should open if there are any missing fields.
  const missingFields = getMissingProfileFieldsKeys(profile);
  const subcategories = use(subcategoriesPromise);

  return (
    <Dialog open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="p-3 md:p-6">
        <DialogHeader>
          <DialogTitle>Completa tu perfil</DialogTitle>
        </DialogHeader>
        <div>
          {(missingFields.includes("category") ||
            missingFields.includes("profileSubcategories")) && (
            <Categories profile={profile} subcategories={subcategories} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
