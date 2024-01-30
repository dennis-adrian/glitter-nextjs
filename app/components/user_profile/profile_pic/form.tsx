'use client';

import {
  UserProfileType,
  updateProfileWithValidatedData,
} from '@/app/api/users/actions';

import { useEdgeStore } from '@/app/lib/edgestore';
import { SingleImageDropzone } from '@/components/single-image-dropzone';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

export default function ProfilePictureForm({
  profile,
  onSuccess,
}: {
  profile: UserProfileType;
  onSuccess: () => void;
}) {
  const [file, setFile] = useState<File>();
  const { edgestore } = useEdgeStore();

  async function handleImageUpload() {
    if (file) {
      const res = await edgestore.publicFiles.upload({
        file,
        onProgressChange: (progress) => {
          // you can use this to show a progress bar
          console.log(progress);
        },
      });

      const result = await updateProfileWithValidatedData(profile.id, {
        ...profile,
        imageUrl: res.url,
      });

      if (result.success) onSuccess();
    }
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
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
      <Button className="w-full" onClick={handleImageUpload}>
        Guardar cambios
      </Button>
    </div>
  );
}
