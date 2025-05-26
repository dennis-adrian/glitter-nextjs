import { OrderStatus } from "@/app/lib/orders/definitions";

export const getStatusColor = (status: OrderStatus) => {
	switch (status) {
		case "paid":
			return "bg-amber-100 text-amber-800 border-amber-200";
		case "pending":
			return "bg-gray-100 text-gray-800 border-gray-200";
		case "processing":
			return "bg-blue-100 text-blue-800 border-blue-200";
		case "delivered":
			return "bg-green-100 text-green-800 border-green-200";
		case "cancelled":
			return "bg-red-100 text-red-800 border-red-200";
		default:
			return "bg-gray-100 text-gray-800 border-gray-200";
	}
};
