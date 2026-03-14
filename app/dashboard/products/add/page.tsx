import { redirect } from "next/navigation";

export default function AddProductPage() {
	redirect("/dashboard/store/products/add");
}
