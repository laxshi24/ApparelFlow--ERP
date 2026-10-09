/**
 * Application error model. Every API failure is returned as
 *   { "error": { "code": string, "message": string, "details"?: unknown } }
 * with a status code chosen by the error class. Unknown errors become a generic 500.
 */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "BUSINESS_RULE_VIOLATION"
  | "CONFLICT"
  | "CSRF_REJECTED"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super(401, "UNAUTHENTICATED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export type FieldIssue = { path: string; message: string };

/** Malformed or invalid request input (schema validation). */
export class ValidationError extends AppError {
  constructor(issues: FieldIssue[], message = "The request contains invalid data") {
    super(400, "VALIDATION_ERROR", message, { issues });
  }
}

/** Well-formed request that violates a business rule (e.g. approving with a shortage). */
export class BusinessRuleError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, "BUSINESS_RULE_VIOLATION", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, "CONFLICT", message, details);
  }
}

export type ApiErrorBody = { error: { code: ErrorCode; message: string; details?: unknown } };
