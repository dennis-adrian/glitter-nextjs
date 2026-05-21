"use client";

import { Edit, Trash2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import CategoryForm from "@/app/components/blog/category-form";
import { Button } from "@/app/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/app/components/ui/dialog";
import { deletePostCategory } from "@/app/lib/posts/actions";
import type { PostCategoryRow } from "@/app/lib/posts/definitions";

export default function CategoriesTable({
	categories,
}: {
	categories: PostCategoryRow[];
}) {
	const router = useRouter();
	const [editing, setEditing] = useState<PostCategoryRow | null>(null);
	const [busyId, setBusyId] = useState<number | null>(null);

	async function handleDelete(c: PostCategoryRow) {
		if (!confirm(`¿Eliminar la categoría "${c.name}"?`)) return;
		setBusyId(c.id);
		try {
			const res = await deletePostCategory(c.id);
			if (res.success) {
				toast.success("Categoría eliminada");
				router.refresh();
			} else {
				toast.error(res.message);
			}
		} finally {
			setBusyId(null);
		}
	}

	if (categories.length === 0) {
		return (
			<div className="text-center py-12 text-muted-foreground border rounded-md bg-white">
				Aún no hay categorías. Crea la primera arriba.
			</div>
		);
	}

	return (
		<div className="border rounded-md bg-white overflow-hidden">
			<ul className="divide-y">
				{categories.map((c) => (
					<li
						key={c.id}
						className="flex items-center gap-3 p-4"
					>
						<div className="flex-1">
							<div className="font-medium">{c.name}</div>
							<div className="text-xs text-muted-foreground">/{c.slug}</div>
							{c.description && (
								<p className="text-sm text-muted-foreground mt-1">
									{c.description}
								</p>
							)}
						</div>
						<Dialog
							open={editing?.id === c.id}
							onOpenChange={(open) => setEditing(open ? c : null)}
						>
							<DialogTrigger asChild>
								<Button variant="outline" size="sm">
									<Edit className="h-4 w-4 mr-1" />
									Editar
								</Button>
							</DialogTrigger>
							<DialogContent>
								<DialogHeader>
									<DialogTitle>Editar categoría</DialogTitle>
								</DialogHeader>
								{editing?.id === c.id && (
									<CategoryForm
										category={editing}
										onDone={() => setEditing(null)}
									/>
								)}
							</DialogContent>
						</Dialog>
						<Button
							variant="destructive"
							size="sm"
							disabled={busyId === c.id}
							onClick={() => handleDelete(c)}
						>
							<Trash2 className="h-4 w-4 mr-1" />
							Eliminar
						</Button>
					</li>
				))}
			</ul>
		</div>
	);
}
