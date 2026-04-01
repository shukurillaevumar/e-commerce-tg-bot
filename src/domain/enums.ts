export const ORDER_STATUSES = [
  "created",
  "invoice_sent",
  "paid",
  "processing",
  "completed",
  "failed",
  "cancelled",
] as const;

export const ORDER_CANCELLATION_REASONS = [
  "expired",
  "user_requested",
  "admin_cancelled",
  "fraud_blocked",
  "payment_replaced",
  "refund_approved",
  "system",
] as const;

export const ORDER_REVIEW_STATUSES = [
  "none",
  "required",
  "in_review",
  "approved",
  "rejected",
] as const;

export const ADMIN_ROLES = ["owner", "admin", "support"] as const;

export const PAYMENT_STATUSES = [
  "created",
  "pre_checkout_approved",
  "succeeded",
  "failed",
  "refunded",
  "cancelled",
] as const;

export const FULFILLMENT_STATUSES = [
  "pending",
  "processing",
  "succeeded",
  "retryable",
  "manual_review",
  "cancelled",
  "failed",
] as const;

export const FULFILLMENT_STRATEGIES = [
  "mock",
  "manual",
  "external_api",
  "custom",
] as const;

export const FULFILLMENT_RESULT_TYPES = [
  "text",
  "link",
  "code",
  "payload",
] as const;

export const FRAUD_RISK_LEVELS = ["low", "medium", "high"] as const;

export const ABUSE_EVENT_TYPES = [
  "orders_rate_limit",
  "failed_payments",
  "promo_abuse",
  "multiple_accounts_pattern",
  "support_abuse",
  "manual_flag",
  "checkout_blocked",
] as const;

export const PROMO_TYPES = [
  "fixed_rub",
  "percent",
  "price_override",
] as const;

export const DISCOUNT_SOURCES = ["none", "promo", "referral"] as const;

export const SUPPORT_TICKET_STATUSES = [
  "open",
  "in_progress",
  "waiting_user",
  "resolved",
  "closed",
] as const;

export const SUPPORT_MESSAGE_AUTHORS = ["user", "support", "admin", "owner"] as const;

export const AUDIT_ACTIONS = [
  "bootstrap_owner",
  "product_created",
  "product_updated",
  "product_archived",
  "variant_created",
  "variant_updated",
  "exchange_rate_updated",
  "promo_created",
  "promo_updated",
  "promo_archived",
  "order_repriced",
  "order_cancelled",
  "order_manual_override",
  "fulfillment_manual_retry",
  "fraud_flag_updated",
  "support_ticket_updated",
  "settings_updated",
  "export_requested",
] as const;

export const USER_SEGMENTS = [
  "new",
  "active",
  "repeat",
  "vip",
  "suspicious",
  "referred",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OrderCancellationReason = (typeof ORDER_CANCELLATION_REASONS)[number];
export type OrderReviewStatus = (typeof ORDER_REVIEW_STATUSES)[number];
export type AdminRole = (typeof ADMIN_ROLES)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];
export type FulfillmentStrategy = (typeof FULFILLMENT_STRATEGIES)[number];
export type FulfillmentResultType = (typeof FULFILLMENT_RESULT_TYPES)[number];
export type FraudRiskLevel = (typeof FRAUD_RISK_LEVELS)[number];
export type AbuseEventType = (typeof ABUSE_EVENT_TYPES)[number];
export type PromoType = (typeof PROMO_TYPES)[number];
export type DiscountSource = (typeof DISCOUNT_SOURCES)[number];
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];
export type SupportMessageAuthor = (typeof SUPPORT_MESSAGE_AUTHORS)[number];
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
export type UserSegment = (typeof USER_SEGMENTS)[number];
