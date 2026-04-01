import { describe, expect, it, vi } from "vitest";
import { PaymentService } from "@services/payment.service";
import { createServiceDeps, createTestUser } from "./helpers";

describe("payment service", () => {
  it("processes successful payment once and moves order into processing", async () => {
    const user = createTestUser();
    const order = {
      id: "ord_1",
      publicId: "ORD-1",
      userId: user.id,
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
    };

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
            telegramPaymentChargeId: null,
            telegramInvoicePayload: order.invoiceSlug,
            telegramCurrency: "XTR",
            amountXtr: 100,
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
          markSucceeded: vi.fn(),
          markFailed: vi.fn(),
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
});
