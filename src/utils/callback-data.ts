import { ValidationError } from "@domain/errors";

const separator = ":";

export function encodeCallbackData(action: string, id?: string, extra?: string): string {
  return [action, id ?? "", extra ?? ""].join(separator).slice(0, 64);
}

export function decodeCallbackData(value: string): { action: string; id?: string; extra?: string } {
  const [action, id, extra] = value.split(separator);
  if (!action) {
    throw new ValidationError("Некорректные callback-данные");
  }
  return {
    action,
    id: id || undefined,
    extra: extra || undefined,
  };
}
