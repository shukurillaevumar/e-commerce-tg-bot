export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function createPublicOrderId(): string {
  return `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function createInvoiceSlug(orderId: string): string {
  return `invoice:${orderId}:${crypto.randomUUID().slice(0, 8)}`;
}
