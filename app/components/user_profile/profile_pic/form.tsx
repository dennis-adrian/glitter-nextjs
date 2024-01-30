'use client';

import { useState } from 'react';

import {
  UserProfileType,
  updateProfileWithValidatedData,
} from '@/app/api/users/actions';
import { useEdgeStore } from '@/app/lib/edgestore';

import { SingleImageDropzone } from '@/components/single-image-dropzone';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

export default function ProfilePictureForm({
  profile,
  onSuccess,
}: {
  profile: UserProfileType;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File>();
  const { edgestore } = useEdgeStore();
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleImageUpload() {
    if (file) {
      const res = await edgestore.publicFiles.upload({
        file,
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
      {showProgress ? (
        <div className="flex items-center justify-center w-full h-[200px]">
          <Progress value={progress} className="w-[60%]" />
        </div>
      ) : (
        <div className="mt-4">
          <SingleImageDropzone
            width={200}
            height={200}
            value={file}
            onChange={(file) => {
              setFile(file);
            }}
          />
        </div>
      )}
      <Button className="w-full" onClick={handleImageUpload}>
        Guardar cambios
      </Button>
    </div>
  );
}
