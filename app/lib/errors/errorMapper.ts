import { ErrorCodes } from "@/app/lib/errors/codes";

// helper function to map error codes to messages
export function mapErrorToMessage(
	errorCode: string,
	customMessage?: string,
): string {
	console.log("errorCode", errorCode);
	switch (errorCode) {
		// Database errors
		case ErrorCodes.DB_CONNECTION_ERROR:
			return "No se pudo conectar a la base de datos";

		case ErrorCodes.USER_NOT_FOUND:
			return "Usuario no encontrado";

		case ErrorCodes.RESERVATION_ALREADY_EXISTS:
			return "Ya hay una reserva para este espacio";

		case ErrorCodes.NO_PERMISSIONS:
			return "No tienes permisos para realizar esta acción";

		case ErrorCodes.USER_HAS_SANCTIONS:
			return "Tu perfil tiene una sanción y no puedes realizar esta acción";

		// Generic
		default:
			return customMessage || "Ha ocurrido un error inesperado";
	}
}
