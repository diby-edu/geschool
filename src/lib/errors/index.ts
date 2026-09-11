/**
 * Erreurs applicatives typees.
 *
 * Regle : une erreur remontee a l'utilisateur ne divulgue jamais de detail
 * technique. `message` est destine a l'affichage, `cause` reste dans les logs.
 *
 * Regle de securite : une ressource hors perimetre renvoie NotFoundError, et
 * non AuthorizationError. Repondre 403 confirmerait l'existence de la ressource
 * et permettrait d'enumerer les etablissements et les eleves.
 */

export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TENANT_READ_ONLY'
  | 'EXTERNAL_SERVICE'
  | 'INTERNAL';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor(
    code: AppErrorCode,
    message: string,
    httpStatus: number,
    options?: { details?: unknown; cause?: unknown },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
    if (options?.details !== undefined) this.details = options.details;
  }

  /** Forme serialisable, sure a renvoyer au client. */
  toClient(): { code: AppErrorCode; message: string; details?: unknown } {
    return this.details !== undefined
      ? { code: this.code, message: this.message, details: this.details }
      : { code: this.code, message: this.message };
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Vous devez vous connecter pour continuer.') {
    super('UNAUTHENTICATED', message, 401);
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Vous n'avez pas l'autorisation d'effectuer cette action.") {
    super('FORBIDDEN', message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Cet element est introuvable.') {
    super('NOT_FOUND', message, 404);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Les informations saisies sont invalides.', details?: unknown) {
    super('VALIDATION', message, 422, details !== undefined ? { details } : undefined);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super('CONFLICT', message, 409, details !== undefined ? { details } : undefined);
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number, message = 'Trop de tentatives. Merci de patienter.') {
    super('RATE_LIMITED', message, 429);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Etablissement suspendu, ou annee scolaire cloturee. */
export class TenantReadOnlyError extends AppError {
  constructor(message = "Cet etablissement est en lecture seule : aucune modification n'est possible.") {
    super('TENANT_READ_ONLY', message, 423);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, cause?: unknown) {
    super('EXTERNAL_SERVICE', `Le service ${service} est temporairement indisponible.`, 503, {
      ...(cause !== undefined ? { cause } : {}),
      details: { service },
    });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Normalise n'importe quoi en AppError. Une erreur inconnue devient INTERNAL
 * avec un message generique : sa vraie cause part dans les logs, jamais au client.
 */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  return new AppError('INTERNAL', "Une erreur inattendue s'est produite.", 500, {
    cause: error,
  });
}
