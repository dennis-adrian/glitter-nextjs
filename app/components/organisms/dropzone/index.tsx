"use client";

import type React from "react";
import { useCallback, useState } from "react";
import {
  UploadIcon,
  XIcon,
  FileTextIcon,
  ImageIcon,
  FilmIcon,
  MusicIcon,
  ArchiveIcon,
  FileIcon,
  CloudUploadIcon,
  Loader2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import FullPreviewDialog from "@/app/components/organisms/dropzone/fullPreviewDialog";
import { useUploadThing } from "@/app/vendors/uploadthing";
import { Button } from "@/app/components/ui/button";
import { toast } from "sonner";
import { Progress } from "@/app/components/ui/progress";

type DropzoneProps = {
  className?: string;
  maxFiles?: number;
  maxSize?: number; // in bytes
  accept?: string[]; // e.g. ['image/*', 'application/pdf']
  onUploadComplete?: (
    files: {
      imageUrl: string;
      fileName: string;
      fileSize: number;
    }[],
  ) => void;
};

export function Dropzone({
  className,
  maxFiles = 5,
  maxSize = 1024 * 1024 * 10, // 10MB
  accept = ["image/*", "application/pdf"],
  onUploadComplete,
}: DropzoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [previewDimensions, setPreviewDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<File | null>(
    null,
  );

  const { isUploading, routeConfig, startUpload } = useUploadThing(
    "festivalActivityParticipantProof",
    {
      onClientUploadComplete(res) {
        if (onUploadComplete) {
          onUploadComplete(
            res.map((r) => ({
              imageUrl: r.url,
              fileName: r.name,
              fileSize: r.size,
            })),
          );
        } else {
          toast.success("Archivos subidos correctamente");
        }
      },
      onUploadError(error: Error) {
        let message = "Hubo un error al subir el archivo.";
        if (error.message.includes("FileCountMismatch")) {
          message = "La cantidad de archivos no es correcta.";
          if (routeConfig?.image?.maxFileCount) {
            message += ` Máximo ${routeConfig.image.maxFileCount} archivo${
              routeConfig.image.maxFileCount > 1 ? "s" : ""
            }.`;
          }
        }

        toast.error(message);
      },
      onUploadProgress(progress) {
        setUploadProgress(progress);
      },
    },
  );

  const loadImageDimensions = useCallback((file: File) => {
    const img = new window.Image();
    img.onload = () => {
      setPreviewDimensions({ width: img.width, height: img.height });
    };
    img.src = URL.createObjectURL(file);
  }, []);

  const handlePreviewClick = useCallback(
    (file: File) => {
      loadImageDimensions(file);
      setShowFullPreview(true);
      setSelectedPreviewFile(file);
    },
    [loadImageDimensions],
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const validateFiles = useCallback(
    (fileList: FileList): File[] => {
      const validFiles: File[] = [];
      setError(null);

      // Convert FileList to array
      const filesArray = Array.from(fileList);

      // Check if too many files
      if (filesArray.length + files.length > maxFiles) {
        setError(`Solo puedes subir hasta ${maxFiles} archivos`);
        return [];
      }

      // Validate each file
      for (const file of filesArray) {
        // Check file size
        if (file.size > maxSize) {
          setError(
            `El archivo "${file.name}" es demasiado grande. El tamaño máximo es ${maxSize / (1024 * 1024)}MB`,
          );
          continue;
        }

        // Check file type
        const fileType = file.type;
        if (
          accept.length > 0 &&
          !accept.some((type) => {
            if (type.endsWith("/*")) {
              const category = type.split("/")[0];
              return fileType.startsWith(`${category}/`);
            }
            return type === fileType;
          })
        ) {
          setError(`El archivo "${file.name}" tiene un formato no soportado`);
          continue;
        }

        validFiles.push(file);
      }

      return validFiles;
    },
    [accept, files.length, maxFiles, maxSize],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const validFiles = validateFiles(e.dataTransfer.files);
        if (validFiles.length > 0) {
          const newFiles = [...files, ...validFiles];
          setFiles(newFiles);
        }
      }
    },
    [files, validateFiles],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const validFiles = validateFiles(e.target.files);
        if (validFiles.length > 0) {
          const newFiles = [...files, ...validFiles];
          setFiles(newFiles);
        }
      }
    },
    [files, validateFiles],
  );

  const removeFile = useCallback(
    (index: number) => {
      const newFiles = [...files];
      newFiles.splice(index, 1);
      setFiles(newFiles);
    },
    [files],
  );

  const getFileIcon = (file: File) => {
    const type = file.type;
    if (type.startsWith("image/")) return <ImageIcon className="w-6 h-6" />;
    if (type.startsWith("video/")) return <FilmIcon className="w-6 h-6" />;
    if (type.startsWith("audio/")) return <MusicIcon className="w-6 h-6" />;
    if (type.startsWith("text/")) return <FileTextIcon className="w-6 h-6" />;
    if (type.includes("zip") || type.includes("compressed"))
      return <ArchiveIcon className="w-6 h-6" />;
    return <FileIcon className="w-6 h-6" />;
  };

  const getFilePreview = (file: File, index: number) => {
    return (
      <div
        key={`${file.name}-${index}`}
        className="flex items-center gap-2 p-2 rounded-md bg-muted/50"
      >
        {file.type.startsWith("image/") ? (
          <div
            className="relative w-6 h-6 object-cover"
            onClick={() => handlePreviewClick(file)}
          >
            <Image
              src={URL.createObjectURL(file)}
              alt={file.name}
              className="rounded-md"
              fill
            />
          </div>
        ) : (
          getFileIcon(file)
        )}
        <div className="flex flex-col gap-1 w-full">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
            </div>
            {isUploading ? (
              <div className="w-4 h-4">
                <Loader2Icon className="w-4 h-4 animate-spin text-primary-400" />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => removeFile(index)}
                className="p-1 rounded-full hover:bg-muted"
                aria-label="Remove file"
              >
                <XIcon className="w-4 h-4" />
              </button>
            )}
          </div>
          {isUploading && (
            <Progress
              indicatorClassName="bg-primary-400"
              className="h-1 bg-primary-50"
              value={uploadProgress}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {previewDimensions && (
        <FullPreviewDialog
          open={showFullPreview}
          onOpenChange={setShowFullPreview}
          previewDimensions={previewDimensions}
          file={selectedPreviewFile}
        />
      )}

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "relative flex flex-col items-center justify-center w-full p-6 transition-colors border-2 border-dashed rounded-lg cursor-pointer",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
        )}
      >
        <input
          id="dropzone-file"
          disabled={isUploading}
          type="file"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handleFileInputChange}
          multiple
          accept={accept.join(",")}
        />
        <div className="flex flex-col items-center justify-center gap-2 text-center">
          <div className="p-3 rounded-full bg-muted">
            <UploadIcon className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">
            <span className="font-semibold text-primary">
              Haz clic para subir
            </span>{" "}
            o arrastra y suelta
          </p>
          <p className="text-xs text-muted-foreground">
            {accept.join(", ")} (máx. {maxFiles} archivos, hasta{" "}
            {maxSize / (1024 * 1024)}MB cada uno)
          </p>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 text-sm font-medium text-destructive bg-destructive/10 rounded-md">
          {error}
        </div>
      )}

      {files.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">
            Archivos seleccionados ({files.length}/{maxFiles})
          </p>
          <div className="flex flex-col gap-2">
            {files.map((file, index) => getFilePreview(file, index))}
          </div>
        </div>
      )}
      <Button
        onClick={() => startUpload(files)}
        disabled={isUploading || files.length === 0}
        className="w-full"
      >
        {isUploading ? "Subiendo..." : "Subir archivos"}
        <CloudUploadIcon className="ml-2 w-4 h-4" />
      </Button>
    </div>
  );
}
