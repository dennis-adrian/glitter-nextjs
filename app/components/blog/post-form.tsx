"use client";

import dynamic from "next/dynamic";

import type { PostFormProps } from "@/app/components/blog/post-form-inner";

const PostFormInner = dynamic(
  () => import("@/app/components/blog/post-form-inner"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[400px] items-center justify-center text-sm text-muted-foreground">
        Cargando editor…
      </div>
    ),
  },
);

export default function PostForm(props: PostFormProps) {
  return <PostFormInner {...props} />;
}
