import { OrderStatus } from "@/app/lib/orders/definitions";

export const getStatusColor = (status: OrderStatus) => {
  switch (status) {
    case "paid":
      return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-900";
    case "pending":
      return "bg-muted text-foreground border-border";
    case "payment_verification":
      return "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-200 dark:border-purple-900";
    case "processing":
      return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-900";
    case "delivered":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-200 dark:border-green-900";
    case "cancelled":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-900";
    default:
      return "bg-muted text-foreground border-border";
  }
};

export const getProgressColor = (status: OrderStatus): string => {
  switch (status) {
    case "pending":
      return "bg-gray-400";
    case "payment_verification":
      return "bg-purple-500";
    case "processing":
      return "bg-blue-500";
    case "paid":
      return "bg-amber-500";
    case "delivered":
      return "bg-green-500";
    case "cancelled":
      return "bg-red-500";
    default:
      return "bg-gray-400";
  }
};

export const calculatePercentage = (
  value: number | undefined,
  total: number,
): number => {
  return value ? (value / total) * 100 : 0;
};
