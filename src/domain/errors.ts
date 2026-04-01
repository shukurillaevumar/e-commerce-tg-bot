export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly expose: boolean;
  readonly metadata: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 500,
    expose = false,
    metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.expose = expose;
    this.metadata = metadata;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super("VALIDATION_ERROR", message, 400, true, metadata);
    this.name = "ValidationError";
  }
}

export class AuthorizationError extends AppError {
  constructor(message = "Недостаточно прав", metadata: Record<string, unknown> = {}) {
    super("AUTHORIZATION_ERROR", message, 403, true, metadata);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Сущность не найдена", metadata: Record<string, unknown> = {}) {
    super("NOT_FOUND", message, 404, true, metadata);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, metadata: Record<string, unknown> = {}) {
    super("CONFLICT", message, 409, true, metadata);
    this.name = "ConflictError";
  }
}
