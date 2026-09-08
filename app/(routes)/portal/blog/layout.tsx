import { redirect } from "next/navigation";

import { canAuthorPosts } from "@/app/lib/posts/eligibility";
import { getCurrentUserProfile } from "@/app/lib/users/helpers";

export default async function PortalBlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentUserProfile();
  if (!profile) redirect("/sign_in");
  if (!(await canAuthorPosts(profile))) redirect("/portal");
  return <>{children}</>;
}
