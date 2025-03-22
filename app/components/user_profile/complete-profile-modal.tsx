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
import { use, useEffect, useState } from "react";
import Categories from "@/app/components/user_profile/creation-process/categories";
import DisplayNameStep from "./creation-process/display-name-step";

type CompleteProfileModalProps = {
  children?: React.ReactNode;
  profile: ProfileType;
  subcategoriesPromise: Promise<Subcategory[]>;
};

export default function CompleteProfileModal({
  children,
  profile,
  subcategoriesPromise,
}: CompleteProfileModalProps) {
  const [open, setOpen] = useState(false);
  const missingFields = getMissingProfileFieldsKeys(profile);
  const subcategories = use(subcategoriesPromise);
  console.log(missingFields);

  useEffect(() => {
    if (missingFields.length > 0) {
      setOpen(true);
    }
  }, [missingFields]);

  const renderContent = () => {
    if (missingFields.includes("category") || missingFields.includes("profileSubcategories")) {
      return <Categories profile={profile} subcategories={subcategories} />;
    }

    if (missingFields.some((field) => ["bio", "displayName"].includes(field))) {
      return <DisplayNameStep profile={profile} />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="p-3 md:p-6" hideCloseButton={missingFields.length > 0}>
        <DialogHeader>
          <DialogTitle>Completa tu perfil</DialogTitle>
        </DialogHeader>
        <div>
          {renderContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
