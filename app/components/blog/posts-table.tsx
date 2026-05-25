"use client";

import { Edit, Eye } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import PostRowActions from "@/app/components/blog/post-row-actions";
import PostStatusBadge from "@/app/components/blog/post-status-badge";
import { Button } from "@/app/components/ui/button";
import { Input } from "@/app/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/app/components/ui/select";
import type { BaseProfile } from "@/app/api/users/definitions";
import {
	POST_STATUS_LABELS,
	type PostStatus,
	type PostWithRelations,
} from "@/app/lib/posts/definitions";
import { canEditPost } from "@/app/lib/posts/helpers";
import { formatFullDate } from "@/app/lib/formatters";

type Props = {
	posts: PostWithRelations[];
	surface: "dashboard" | "portal";
	viewer: Pick<BaseProfile, "id" | "role">;
};

const STATUS_OPTIONS: PostStatus[] = [
	"draft",
	"submitted",
	"approved",
	"scheduled",
	"published",
	"rejected",
	"archived",
];

export default function PostsTable({ posts, surface, viewer }: Props) {
	const [q, setQ] = useState("");
	const [status, setStatus] = useState<PostStatus | "all">("all");

	const filtered = useMemo(() => {
		return posts.filter((p) => {
			if (status !== "all" && p.status !== status) return false;
			if (q.trim() && !p.title.toLowerCase().includes(q.trim().toLowerCase())) {
				return false;
			}
			return true;
		});
	}, [posts, q, status]);

	const editBase = surface === "dashboard" ? "/dashboard/blog" : "/portal/blog";

	return (
		<div className="space-y-4">
			<div className="flex flex-col md:flex-row gap-3 md:items-end">
				<div className="flex-1">
					<label
						htmlFor="post-search"
						className="text-xs text-muted-foreground"
					>
						Buscar por título
					</label>
					<Input
						id="post-search"
						value={q}
						onChange={(e) => setQ(e.target.value)}
						placeholder="Buscar…"
					/>
				</div>
				<div className="md:w-56">
					<label
						htmlFor="post-status"
						className="text-xs text-muted-foreground"
					>
						Estado
					</label>
					<Select
						value={status}
						onValueChange={(v) => setStatus(v as PostStatus | "all")}
					>
						<SelectTrigger id="post-status">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">Todos</SelectItem>
							{STATUS_OPTIONS.map((s) => (
								<SelectItem key={s} value={s}>
									{POST_STATUS_LABELS[s]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{filtered.length === 0 ? (
				<div className="text-center py-12 text-muted-foreground border rounded-md bg-white">
					Sin artículos para mostrar.
				</div>
			) : (
				<div className="border rounded-md bg-white overflow-hidden">
					<ul className="divide-y">
						{filtered.map((p) => (
							<li
								key={p.id}
								className="flex flex-col md:flex-row md:items-center gap-3 p-4"
							>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 mb-1">
										<PostStatusBadge status={p.status} />
										<span className="text-xs text-muted-foreground">
											Actualizado {formatFullDate(p.updatedAt)}
										</span>
									</div>
									<h3 className="font-medium truncate">
										{p.title || "Sin título"}
									</h3>
									{p.excerpt && (
										<p className="text-sm text-muted-foreground line-clamp-1">
											{p.excerpt}
										</p>
									)}
								</div>
								<div className="flex gap-2">
									{canEditPost(viewer, p) && (
										<Button asChild variant="outline" size="sm">
											<Link href={`${editBase}/${p.id}/edit`}>
												<Edit className="h-4 w-4 mr-1" />
												Editar
											</Link>
										</Button>
									)}
									{p.status === "published" && (
										<Button asChild variant="ghost" size="sm">
											<Link
												href={`/blog/${p.slug}`}
												target="_blank"
												rel="noopener noreferrer"
											>
												<Eye className="h-4 w-4 mr-1" />
												Ver
											</Link>
										</Button>
									)}
									<PostRowActions post={p} viewer={viewer} />
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
