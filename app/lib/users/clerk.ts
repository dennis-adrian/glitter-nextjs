import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient } from "@clerk/nextjs/server";

type DeleteClerkUserResult =
  | {
      success: true;
      status: "deleted" | "already_deleted";
      message: string;
    }
  | {
      success: false;
      status: "request_failed";
      message: string;
    };

export async function deleteClerkUser(
  clerkId: string,
): Promise<DeleteClerkUserResult> {
  try {
    const clerk = await clerkClient();
    const existingUser = await clerk.users.getUser(clerkId);
    if (!existingUser) {
      console.log("Clerk user not found");
      return {
        success: true,
        status: "already_deleted" as const,
        message: "Usuario no encontrado",
      };
    }

    await clerk.users.deleteUser(clerkId);
    return {
      success: true,
      status: "deleted" as const,
      message: "Cuenta eliminada correctamente.",
    };
  } catch (error) {
    if (isClerkAPIResponseError(error) && error.status === 404) {
      return {
        success: true,
        status: "already_deleted" as const,
        message: "Usuario no encontrado",
      };
    }

    console.error("Error deleting clerk user", error);
    return {
      success: false,
      status: "request_failed",
      message: "Error al eliminar la cuenta.",
    };
  }
}
