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
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { createPortal } from "react-dom";

interface DropzoneProps {
  className?: string;
  maxFiles?: number;
  maxSize?: number; // in bytes
  accept?: string[]; // e.g. ['image/*', 'application/pdf']
  onFilesAdded?: (files: File[]) => void;
}

export function Dropzone({
  className,
  maxFiles = 5,
  maxSize = 1024 * 1024 * 10, // 10MB
  accept = ["image/*", "application/pdf"],
  onFilesAdded,
}: DropzoneProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [previewDimensions, setPreviewDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

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
          if (onFilesAdded) {
            onFilesAdded(newFiles);
          }
        }
      }
    },
    [files, onFilesAdded, validateFiles],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const validFiles = validateFiles(e.target.files);
        if (validFiles.length > 0) {
          const newFiles = [...files, ...validFiles];
          setFiles(newFiles);
          if (onFilesAdded) {
            onFilesAdded(newFiles);
          }
        }
      }
    },
    [files, onFilesAdded, validateFiles],
  );

  const removeFile = useCallback(
    (index: number) => {
      const newFiles = [...files];
      newFiles.splice(index, 1);
      setFiles(newFiles);
      if (onFilesAdded) {
        onFilesAdded(newFiles);
      }
    },
    [files, onFilesAdded],
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
            className="relative w-6 h-6"
            onClick={() => handlePreviewClick(file)}
          >
            <Image
              src={URL.createObjectURL(file)}
              alt={file.name}
              className="rounded-md"
              fill
              objectFit="cover"
            />
          </div>
        ) : (
          getFileIcon(file)
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {(file.size / 1024).toFixed(1)} KB
          </p>
        </div>
        <button
          type="button"
          onClick={() => removeFile(index)}
          className="p-1 rounded-full hover:bg-muted"
          aria-label="Remove file"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>
    );
  };

  const generatePreviewPortal = useCallback(() => {
    if (!previewDimensions) return null;
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 overflow-auto">
        <div className="relative min-w-0 min-h-0 max-w-none max-h-none">
          <Image
            src={URL.createObjectURL(files[0])}
            alt={files[0].name}
            width={previewDimensions.width}
            height={previewDimensions.height}
            className="max-w-none"
            unoptimized
          />
        </div>
        <button
          onClick={() => setShowFullPreview(false)}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/50 hover:bg-black/70"
          aria-label="Close preview"
        >
          <XIcon className="w-6 h-6 text-white" />
        </button>
      </div>,
      document.body,
    );
  }, [files, previewDimensions, setShowFullPreview]);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {showFullPreview && previewDimensions && generatePreviewPortal()}
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
    </div>
  );
}
