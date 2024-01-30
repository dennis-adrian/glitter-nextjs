'use client';

import { UserProfileType, updateProfileWithValidatedData } from '@/app/api/users/actions';
import { Button } from '@/app/components/ui/button';
import { SingleImageDropzone } from '@/components/single-image-dropzone';
import { useEdgeStore } from '@/lib/edgestore';
import { useState } from 'react';

export function SingleImageDropzoneUsage({
  profile,
}: {
  profile: UserProfileType;
}) {
  const [file, setFile] = useState<File>();
  const { edgestore } = useEdgeStore();

  return (
    <div className="flex flex-col items-center justify-center">
      <SingleImageDropzone
        width={136}
        height={136}
        value={file}
        onChange={(file) => {
          setFile(file);
        }}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          if (file) {
            const res = await edgestore.publicFiles.upload({
              file,
              onProgressChange: (progress) => {
                // you can use this to show a progress bar
                console.log(progress);
              },
            });
            // you can run some server action or api here
            // to add the necessary data to your database
            console.log(res);
            updateProfileWithValidatedData(profile.id, {
              ...profile,
              imageUrl: res.url,
            });
          }
        }}
      >
        Guardar cambios
      </Button>
    </div>
  );
}
