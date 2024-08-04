"use client";

import { useState } from "react";

import { updateProfileWithValidatedData } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { useEdgeStore } from "@/app/lib/edgestore";

import { SingleImageDropzone } from "@/components/single-image-dropzone";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import AutomaticProfilePicUploadForm from "@/app/components/user_profile/profile_pic/automatic_upload_form";

export default function ProfilePictureForm({
  profile,
  onSuccess,
}: {
  profile: ProfileType;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File>();
  const { edgestore } = useEdgeStore();
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);

  let uploadOptions = {};
  if (profile.imageUrl && profile.imageUrl.includes("edgestore")) {
    uploadOptions = {
      replaceTargetUrl: profile.imageUrl,
    };
  }

  async function handleImageUpload() {
    if (file) {
      const res = await edgestore.publicFiles.upload({
        file,
        options: uploadOptions,
        onProgressChange: (progress) => {
          setShowProgress(true);
          setProgress(progress);
        },
      });

      const result = await updateProfileWithValidatedData(profile.id, {
        ...profile,
        imageUrl: res.url,
      });

      if (result.success) {
        setShowProgress(false);
        onSuccess();
      }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <AutomaticProfilePicUploadForm profile={profile} />
    </div>
  );
}
