import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import type { PostCategoryRow } from "@/app/lib/posts/definitions";

export default function CategoryPill({ category }: { category: PostCategoryRow }) {
	return (
		<Link href={`/blog/category/${category.slug}`}>
			<Badge variant="secondary" className="hover:bg-pink-100 transition-colors">
				{category.name}
			</Badge>
		</Link>
	);
}
