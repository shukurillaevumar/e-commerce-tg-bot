import { ConflictError } from "@domain/errors";
import type { OrderStatus } from "@domain/enums";

const VALID_ORDER_TRANSITIONS: Record<OrderStatus, ReadonlySet<OrderStatus>> = {
  created: new Set(["invoice_sent", "cancelled"]),
  invoice_sent: new Set(["paid", "cancelled"]),
  paid: new Set(["processing", "cancelled"]),
  processing: new Set(["completed", "failed"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

export function assertValidOrderTransition(from: OrderStatus, to: OrderStatus): void {
  const allowed = VALID_ORDER_TRANSITIONS[from];
  if (!allowed.has(to)) {
    throw new ConflictError("Недопустимый переход статуса заказа", {
      from,
      to,
      allowed: [...allowed],
    });
  }
}

export function canTransitionOrder(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_ORDER_TRANSITIONS[from].has(to);
}
