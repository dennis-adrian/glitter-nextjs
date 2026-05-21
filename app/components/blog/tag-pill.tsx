import Link from "next/link";

import { Badge } from "@/app/components/ui/badge";
import type { PostTagRow } from "@/app/lib/posts/definitions";

export default function TagPill({ tag }: { tag: PostTagRow }) {
	return (
		<Link href={`/blog/tag/${tag.slug}`}>
			<Badge
				variant="outline"
				className="hover:bg-muted transition-colors"
			>
				#{tag.name}
			</Badge>
		</Link>
	);
}
