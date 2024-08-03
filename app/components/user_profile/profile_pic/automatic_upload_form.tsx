"use client";

import { useState } from "react";

import { updateProfileWithValidatedData } from "@/app/api/users/actions";
import { ProfileType } from "@/app/api/users/definitions";
import { useEdgeStore } from "@/app/lib/edgestore";

import { SingleImageDropzone } from "@/components/single-image-dropzone";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/app/lib/utils";

export default function AutomaticProfilePicUploadForm({
  profile,
  size,
}: {
  profile: ProfileType;
  size?: "sm" | "md" | "lg";
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

  let imageSize = { width: 120, height: 120 };
  let containerSize = "w-[120px] h-[120px]";
  if (size === "md") {
    imageSize = { width: 260, height: 260 };
    containerSize = "w-[260px] h-[260px]";
  }

  if (size === "lg") {
    imageSize = { width: 520, height: 520 };
    containerSize = "w-[520px] h-[520px]";
  }

  return (
    <div className={cn("", containerSize)}>
      {showProgress ? (
        <div className="flex flex-col gap-3 items-center justify-center w-full h-full border border-dashed">
          <Progress value={progress} className="w-[90%]" />
          <span className="text-muted-foreground text-sm">
            Subiendo imagen...
          </span>
        </div>
      ) : (
        <div className="mt-4 mb-6">
          <SingleImageDropzone
            canRemove={false}
            value={profile.imageUrl || ""}
            dropzoneOptions={{
              maxSize: 1024 * 1024 * 3, // 3MB,
            }}
            onChange={(file) => handleImageUpload(file)}
            {...imageSize}
          />
        </div>
      )}
    </div>
  );
}
