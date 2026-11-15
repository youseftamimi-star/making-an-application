export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "WRONG_PIN"
  | "PIN_LOCKED"
  | "CREDIT_LIMIT_EXCEEDED"
  | "PAYMENT_EXCEEDS_BALANCE"
  | "OVERRIDE_REQUIRED"
  | "ALREADY_CANCELLED"
  | "PHONE_EXISTS"
  | "USERNAME_EXISTS"
  | "BAD_CREDENTIALS"
  | "RATE_LIMITED"
  | "ALREADY_SET_UP";

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  WRONG_PIN: 422,
  PIN_LOCKED: 423,
  CREDIT_LIMIT_EXCEEDED: 409,
  PAYMENT_EXCEEDS_BALANCE: 409,
  OVERRIDE_REQUIRED: 403,
  ALREADY_CANCELLED: 409,
  PHONE_EXISTS: 409,
  USERNAME_EXISTS: 409,
  BAD_CREDENTIALS: 401,
  RATE_LIMITED: 429,
  ALREADY_SET_UP: 409,
};

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    public extra: Record<string, unknown> = {},
  ) {
    super(code);
  }
  get status() {
    return STATUS[this.code];
  }
}
