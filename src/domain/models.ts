import type {
  AbuseEventType,
  AdminRole,
  AuditAction,
  DiscountSource,
  FraudRiskLevel,
  FulfillmentResultType,
  FulfillmentStatus,
  FulfillmentStrategy,
  OrderCancellationReason,
  OrderReviewStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PromoType,
  SupportMessageAuthor,
  SupportTicketStatus,
  UserSegment,
} from "@domain/enums";
import type { StorefrontCurrency } from "@domain/currency";

export interface User {
  id: string;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  isBot: boolean;
  riskLevel: FraudRiskLevel;
  suspicious: boolean;
  allowlisted: boolean;
  denylisted: boolean;
  referredByUserId: string | null;
  referralCode: string;
  activeTicketId: string | null;
  segment: UserSegment;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
}

export interface Admin {
  id: string;
  userId: string;
  telegramId: number;
  role: AdminRole;
  permissions: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  slug: string;
  title: string;
  description: string;
  photoFileId: string | null;
  photoUniqueId: string | null;
  isActive: boolean;
  sortOrder: number;
  availabilityMode: "unlimited" | "soft_limit" | "hard_limit" | "manual";
  availabilityLimit: number | null;
  isFeatured: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  title: string;
  packageSize: string | null;
  tariff: string | null;
  offerType: string | null;
  rubPrice: number;
  isActive: boolean;
  fulfillmentStrategy: FulfillmentStrategy;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ExchangeRate {
  id: string;
  version: number;
  rateRubPerStar: number;
  source: "manual";
  comment: string | null;
  createdByAdminId: string;
  createdAt: string;
  isCurrent: boolean;
}

export interface PricingSnapshot {
  rubPriceBase: number;
  rubPriceFinal: number;
  displayCurrency: StorefrontCurrency;
  displayAmount: number;
  rateVersion: number;
  rateValue: number;
  xtrPrice: number;
  discountSource: DiscountSource;
  discountType: PromoType | "referral_first_purchase" | "none";
  discountValue: number;
  promoCodeId: string | null;
  referralDiscountApplied: boolean;
  pricingRuleVersion: number;
}

export interface Order {
  id: string;
  publicId: string;
  userId: string;
  productId: string;
  productVariantId: string;
  status: OrderStatus;
  reviewStatus: OrderReviewStatus;
  cancellationReason: OrderCancellationReason | null;
  retryCount: number;
  invoiceSlug: string | null;
  invoiceMessageId: number | null;
  invoiceSentAt: string | null;
  invoiceExpiresAt: string | null;
  paidAt: string | null;
  processingStartedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  pricingSnapshot: PricingSnapshot;
  campaignSource: string | null;
  referralId: string | null;
  promoCodeId: string | null;
  requiresManualReview: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  orderId: string;
  userId: string;
  paymentMethod: PaymentMethod;
  telegramPaymentChargeId: string | null;
  telegramInvoicePayload: string;
  telegramCurrency: "XTR";
  amountXtr: number;
  providerInvoiceId: string | null;
  providerCurrency: string | null;
  providerAmount: string | null;
  status: PaymentStatus;
  providerData: Record<string, unknown>;
  idempotencyKey: string;
  pricingSnapshot: PricingSnapshot;
  failureCode: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  succeededAt: string | null;
}

export interface PromoCode {
  id: string;
  code: string;
  type: PromoType;
  value: number;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
  usageLimitTotal: number | null;
  usageLimitPerUser: number | null;
  productId: string | null;
  productVariantId: string | null;
  allowedSegments: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PromoRedemption {
  id: string;
  promoCodeId: string;
  userId: string;
  orderId: string | null;
  status: "applied" | "rejected";
  rejectionReason: string | null;
  createdAt: string;
}

export interface Referral {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  startParameter: string;
  firstOrderId: string | null;
  rewardGrantedAt: string | null;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  status: SupportTicketStatus;
  subject: string;
  priority: "normal" | "high";
  assignedAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  authorType: SupportMessageAuthor;
  authorUserId: string | null;
  messageText: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorAdminId: string | null;
  actorUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface FulfillmentJob {
  id: string;
  orderId: string;
  productVariantId: string;
  strategy: FulfillmentStrategy;
  status: FulfillmentStatus;
  attempt: number;
  maxAttempts: number;
  priority: "normal" | "high";
  scheduledAt: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  resultType: FulfillmentResultType | null;
  resultPayload: Record<string, unknown> | null;
  resultMaskedText: string | null;
  assignedAdminId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface AbuseEvent {
  id: string;
  userId: string | null;
  eventType: AbuseEventType;
  riskLevel: FraudRiskLevel;
  signal: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SettingRecord {
  key: string;
  value: string;
  updatedByAdminId: string | null;
  updatedAt: string;
}
