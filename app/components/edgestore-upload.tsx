'use client';

import React from 'react';
import { useEdgeStore } from '../lib/edgestore';
import { Button } from '@/app/components/ui/button';
import { Label } from '@/app/components/ui/label';
import { Input } from '@/app/components/ui/input';

const EdgeStoreUpload = () => {
  const [file, setFile] = React.useState<File>();
  const { edgestore } = useEdgeStore();
  console.log(file);

  async function uploadFile() {
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
    }
  }

  return (
    <div>
      <div className="grid w-full max-w-sm items-center gap-1.5">
        <Label htmlFor="picture">Picture</Label>
        <Input
          accept="image/*"
          onChange={(e) => {
            setFile(e.target.files?.[0]);
          }}
          id="picture"
          type="file"
        />
        <Button onClick={uploadFile}>Upload</Button>
      </div>
    </div>
  );
};

export default EdgeStoreUpload;
