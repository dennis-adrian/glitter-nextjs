import { notFound, redirect } from "next/navigation";

import PostForm from "@/app/components/blog/post-form";
import {
  fetchPostByIdForEditor,
  fetchPostCategories,
} from "@/app/lib/posts/data";
import { canEditPost } from "@/app/lib/posts/helpers";
import { fetchLiveShareLink } from "@/app/lib/posts/share-links";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function DashboardBlogEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/sign_in");

  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) notFound();

  const [post, categories, shareLink] = await Promise.all([
    fetchPostByIdForEditor(postId),
    fetchPostCategories(),
    fetchLiveShareLink(postId),
  ]);
  if (!post) notFound();
  if (!canEditPost(profile, post)) redirect("/dashboard/blog");

  return (
    <div className="container mx-auto px-4 md:px-6 py-8">
      <PostForm
        surface="dashboard"
        post={post}
        categoryOptions={categories}
        canPublish
        shareLink={shareLink}
      />
    </div>
  );
}
