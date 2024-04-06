"use client";

import { useState } from "react";

import { updateProfileWithValidatedData } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { useEdgeStore } from "@/app/lib/edgestore";

import { SingleImageDropzone } from "@/components/single-image-dropzone";
import { Progress } from "@/components/ui/progress";

export default function AutomaticProfilePicUploadForm({
  profile,
}: {
  profile: ProfileType;
}) {
  const { edgestore } = useEdgeStore();
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);

  let uploadOptions = {};
  if (profile.imageUrl && profile.imageUrl.includes("edgestore")) {
    uploadOptions = {
      replaceTargetUrl: profile.imageUrl,
    };
  }

  async function handleImageUpload(newFile?: File) {
    if (newFile) {
      const res = await edgestore.publicFiles.upload({
        file: newFile,
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
      }
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {showProgress ? (
        <div className="flex items-center justify-center w-full h-[200px]">
          <Progress value={progress} className="w-[60%]" />
        </div>
      ) : (
        <div className="mt-4 mb-6">
          <SingleImageDropzone
            canRemove={false}
            width={120}
            height={120}
            value={profile.imageUrl || ""}
            dropzoneOptions={{
              maxSize: 1024 * 1024 * 3, // 3MB,
            }}
            onChange={(file) => handleImageUpload(file)}
          />
        </div>
      )}
    </div>
  );
}
