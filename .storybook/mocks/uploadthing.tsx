"use client";

import { useState, type ChangeEvent, type ReactNode } from "react";

type UploadState = {
  ready: boolean;
  isUploading: boolean;
  uploadProgress: number;
};

type ContentRenderer = ReactNode | ((state: UploadState) => ReactNode);
type ClassRenderer = string | ((state: UploadState) => string);

type MockUploadButtonProps = {
  endpoint: string;
  content?: {
    button?: ContentRenderer;
    allowedContent?: ContentRenderer;
  };
  appearance?: {
    button?: ClassRenderer;
    allowedContent?: ClassRenderer;
  };
  onBeforeUploadBegin?: (files: File[]) => File[];
  onClientUploadComplete?: (results: MockUploadResult[]) => void;
  onUploadError?: (error: { code: string; message: string }) => void;
};

type MockUploadResult = {
  key: string;
  name: string;
  size: number;
  type: string;
  url: string;
  serverData: {
    imageId?: number;
    imageUrl: string;
    results: {
      fileKey: string;
      imageUrl: string;
      profileId: number;
    };
  };
};

type HookOptions = {
  onClientUploadComplete?: (results: MockUploadResult[]) => void;
  onUploadError?: (error: Error) => void;
  onUploadProgress?: (progress: number) => void;
};

const MOCK_IMAGE_URL = "/img/banner-caceria-de-sellos.png";
const MOCK_PROGRAM_ARTWORK_URL =
  "https://ja4q35y666.ufs.sh/f/WpsJq20QkpNgUNwAtQc0euIzkCdrXyN91qS6cOjvapWi280J";

function resultFor(file: File, endpoint: string): MockUploadResult {
  const imageUrl =
    endpoint === "programArtwork" ? MOCK_PROGRAM_ARTWORK_URL : MOCK_IMAGE_URL;

  return {
    key: `storybook-${endpoint}-${file.name}`,
    name: file.name,
    size: file.size,
    type: file.type,
    url: imageUrl,
    serverData: {
      imageId: endpoint === "productImage" ? 101 : undefined,
      imageUrl,
      results: {
        fileKey: `storybook-${file.name}`,
        imageUrl,
        profileId: 1,
      },
    },
  };
}

function renderContent(
  renderer: ContentRenderer | undefined,
  state: UploadState,
  fallback: ReactNode,
) {
  if (typeof renderer === "function") return renderer(state);
  return renderer ?? fallback;
}

function renderClass(renderer: ClassRenderer | undefined, state: UploadState) {
  return typeof renderer === "function" ? renderer(state) : renderer;
}

/**
 * Storybook-only UploadThing mock. It keeps file selection and callbacks real
 * while replacing network/auth/storage with deterministic local results.
 */
export function UploadButton({
  endpoint,
  content,
  appearance,
  onBeforeUploadBegin,
  onClientUploadComplete,
  onUploadError,
}: MockUploadButtonProps) {
  const [state, setState] = useState<UploadState>({
    ready: true,
    isUploading: false,
    uploadProgress: 0,
  });

  async function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files ?? []);
    if (selectedFiles.length === 0) return;

    const files = onBeforeUploadBegin?.(selectedFiles) ?? selectedFiles;
    setState({ ready: true, isUploading: true, uploadProgress: 35 });
    await new Promise((resolve) => setTimeout(resolve, 20));

    if (files.some((file) => file.name.includes("error"))) {
      onUploadError?.({ code: "BAD_REQUEST", message: "Mock upload failed" });
      setState({ ready: true, isUploading: false, uploadProgress: 0 });
      return;
    }

    setState({ ready: true, isUploading: true, uploadProgress: 100 });
    await new Promise((resolve) => setTimeout(resolve, 20));
    onClientUploadComplete?.(files.map((file) => resultFor(file, endpoint)));
    setState({ ready: true, isUploading: false, uploadProgress: 0 });
    event.target.value = "";
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <label
        className={
          renderClass(appearance?.button, state) ??
          "inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-xs"
        }
      >
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={`Seleccionar archivo para ${endpoint}`}
          onChange={handleChange}
        />
        {renderContent(content?.button, state, "Subir imagen")}
      </label>
      <div
        className={
          renderClass(appearance?.allowedContent, state) ??
          "text-xs text-muted-foreground"
        }
      >
        {renderContent(content?.allowedContent, state, "Imagen de hasta 4 MB")}
      </div>
    </div>
  );
}

export function UploadDropzone(props: MockUploadButtonProps) {
  return <UploadButton {...props} />;
}

export function useUploadThing(endpoint: string, options: HookOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);

  return {
    isUploading,
    routeConfig: {
      image: {
        maxFileCount: endpoint === "festivalActivityParticipantProof" ? 5 : 1,
      },
    },
    async startUpload(files: File[]) {
      setIsUploading(true);
      options.onUploadProgress?.(35);
      await new Promise((resolve) => setTimeout(resolve, 20));

      if (files.some((file) => file.name.includes("error"))) {
        const error = new Error("Mock upload failed");
        options.onUploadError?.(error);
        setIsUploading(false);
        return undefined;
      }

      options.onUploadProgress?.(100);
      const results = files.map((file) => resultFor(file, endpoint));
      options.onClientUploadComplete?.(results);
      setIsUploading(false);
      return results;
    },
  };
}

export const routeRegistry = {};
