import { describe, expect, it, vi } from "vitest";
import { PaymentService } from "@services/payment-next.service";
import { createServiceDeps, createTestUser } from "./helpers";

function createOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ord_1",
    publicId: "ORD-1",
    userId: "usr_1",
    productId: "prd_1",
    productVariantId: "var_1",
    status: "invoice_sent",
    reviewStatus: "none",
    cancellationReason: null,
    retryCount: 1,
    invoiceSlug: "invoice:ord_1:abc",
    invoiceMessageId: null,
    invoiceSentAt: "2026-04-01T00:00:00.000Z",
    invoiceExpiresAt: "2026-04-01T00:15:00.000Z",
    paidAt: null,
    processingStartedAt: null,
    completedAt: null,
    failedAt: null,
    pricingSnapshot: {
      rubPriceBase: 100,
      rubPriceFinal: 100,
      rateVersion: 1,
      rateValue: 1,
      xtrPrice: 100,
      discountSource: "none",
      discountType: "none",
      discountValue: 0,
      promoCodeId: null,
      referralDiscountApplied: false,
      pricingRuleVersion: 1,
    },
    campaignSource: null,
    referralId: null,
    promoCodeId: null,
    requiresManualReview: false,
    notes: null,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("payment service", () => {
  it("processes Telegram Stars payment once and moves order into processing", async () => {
    const user = createTestUser();
    const order = createOrder({ userId: user.id });

    const deps = createServiceDeps({
      repositories: {
        ...createServiceDeps().repositories,
        users: {
          updateRiskState: vi.fn(),
          findById: vi.fn(async () => user),
        },
        orders: {
          findById: vi.fn(async () => order),
          markPaid: vi.fn(),
          markProcessing: vi.fn(),
        },
        payments: {
          findByInvoicePayload: vi.fn(async () => ({
            id: "pay_1",
            orderId: order.id,
            userId: user.id,
            paymentMethod: "telegram_stars",
            telegramPaymentChargeId: null,
            telegramInvoicePayload: order.invoiceSlug,
            telegramCurrency: "XTR",
            amountXtr: 100,
            providerInvoiceId: null,
            providerCurrency: "XTR",
            providerAmount: "100",
            status: "created",
            providerData: {},
            idempotencyKey: "k1",
            pricingSnapshot: order.pricingSnapshot,
            failureCode: null,
            failureReason: null,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            succeededAt: null,
          })),
          findByProviderInvoiceId: vi.fn(async () => null),
          markSucceeded: vi.fn(),
          markFailed: vi.fn(),
          updateStatus: vi.fn(),
          findByOrderId: vi.fn(async () => null),
        },
        products: {
          findVariantById: vi.fn(async () => ({
            id: "var_1",
            productId: "prd_1",
            sku: "SKU-1",
            title: "Пакет 100",
            packageSize: "100",
            tariff: null,
            offerType: null,
            rubPrice: 100,
            isActive: true,
            fulfillmentStrategy: "mock",
            metadata: {},
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          })),
        },
        fulfillmentJobs: {
          findByOrderId: vi.fn(async () => null),
          create: vi.fn(),
        },
        admins: {
          listActive: vi.fn(async () => []),
        },
      } as never,
    });

    const service = new PaymentService(deps);
    await service.handleSuccessfulPayment({
      paymentUpdateId: "9001",
      invoicePayload: "invoice:ord_1:abc",
      telegramChargeId: "charge_1",
      totalAmount: 100,
    });

    expect(deps.repositories.payments.markSucceeded).toHaveBeenCalled();
    expect(deps.repositories.orders.markPaid).toHaveBeenCalledWith(order.id, expect.any(String));
    expect(deps.repositories.orders.markProcessing).toHaveBeenCalledWith(order.id, expect.any(String));
    expect(deps.repositories.fulfillmentJobs.create).toHaveBeenCalled();
  });

  it("processes Crypto Bot webhook and moves order into processing", async () => {
    const user = createTestUser();
    const order = createOrder({ userId: user.id, publicId: "ORD-CRYPTO" });

    const deps = createServiceDeps({
      repositories: {
        ...createServiceDeps().repositories,
        users: {
          updateRiskState: vi.fn(),
          findById: vi.fn(async () => user),
        },
        orders: {
          findById: vi.fn(async () => order),
          markPaid: vi.fn(),
          markProcessing: vi.fn(),
        },
        payments: {
          findByInvoicePayload: vi.fn(async () => ({
            id: "pay_2",
            orderId: order.id,
            userId: user.id,
            paymentMethod: "crypto_bot",
            telegramPaymentChargeId: null,
            telegramInvoicePayload: order.invoiceSlug,
            telegramCurrency: "XTR",
            amountXtr: 100,
            providerInvoiceId: "42",
            providerCurrency: "RUB",
            providerAmount: "100.00",
            status: "created",
            providerData: {},
            idempotencyKey: "k2",
            pricingSnapshot: order.pricingSnapshot,
            failureCode: null,
            failureReason: null,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            succeededAt: null,
          })),
          findByProviderInvoiceId: vi.fn(async () => null),
          markSucceeded: vi.fn(),
          markFailed: vi.fn(),
          updateStatus: vi.fn(),
          findByOrderId: vi.fn(async () => null),
        },
        products: {
          findVariantById: vi.fn(async () => ({
            id: "var_1",
            productId: "prd_1",
            sku: "SKU-1",
            title: "Пакет 100",
            packageSize: "100",
            tariff: null,
            offerType: null,
            rubPrice: 100,
            isActive: true,
            fulfillmentStrategy: "mock",
            metadata: {},
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          })),
        },
        fulfillmentJobs: {
          findByOrderId: vi.fn(async () => null),
          create: vi.fn(),
        },
        admins: {
          listActive: vi.fn(async () => []),
        },
      } as never,
    });

    const service = new PaymentService(deps);
    await service.handleCryptoPayInvoicePaid({
      update_id: 1,
      update_type: "invoice_paid",
      request_date: "2026-04-01T00:05:00.000Z",
      payload: {
        invoice_id: 42,
        status: "paid",
        amount: "100.00",
        fiat: "RUB",
        payload: order.invoiceSlug,
        paid_asset: "USDT",
        paid_amount: "1.12",
      },
    });

    expect(deps.repositories.payments.markSucceeded).toHaveBeenCalledWith(
      "pay_2",
      "42",
      expect.objectContaining({
        invoiceId: 42,
        paidAsset: "USDT",
        paidAmount: "1.12",
        payload: order.invoiceSlug,
      }),
      expect.any(String),
    );
    expect(deps.repositories.orders.markPaid).toHaveBeenCalledWith(order.id, expect.any(String));
    expect(deps.repositories.orders.markProcessing).toHaveBeenCalledWith(order.id, expect.any(String));
    expect(deps.repositories.fulfillmentJobs.create).toHaveBeenCalled();
  });
});
