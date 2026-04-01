import type { FulfillmentJob, Order, ProductVariant, User } from "@domain/models";

export interface FulfillmentSuccess {
  success: true;
  resultType: "text" | "link" | "code" | "payload";
  payload: Record<string, unknown>;
  maskedText: string | null;
}

export interface FulfillmentFailure {
  success: false;
  retryable: boolean;
  code: string;
  message: string;
}

export type FulfillmentResult = FulfillmentSuccess | FulfillmentFailure;

export interface FulfillmentProvider {
  process(input: {
    job: FulfillmentJob;
    order: Order;
    user: User;
    variant: ProductVariant;
  }): Promise<FulfillmentResult>;
  retry(input: {
    job: FulfillmentJob;
    order: Order;
    user: User;
    variant: ProductVariant;
  }): Promise<FulfillmentResult>;
  cancel(input: { job: FulfillmentJob; order: Order }): Promise<void>;
}

export class MockFulfillmentProvider implements FulfillmentProvider {
  async process(input: { job: FulfillmentJob; order: Order; user: User; variant: ProductVariant }): Promise<FulfillmentResult> {
    return {
      success: true,
      resultType: "text",
      payload: {
        sku: input.variant.sku,
        packageSize: input.variant.packageSize,
        message: `Пакет ${input.variant.title} готов к выдаче`,
      },
      maskedText: `Доступ активирован: ${input.variant.title}`,
    };
  }

  async retry(input: { job: FulfillmentJob; order: Order; user: User; variant: ProductVariant }): Promise<FulfillmentResult> {
    return this.process(input);
  }

  async cancel(): Promise<void> {}
}

export class ManualFulfillmentProvider implements FulfillmentProvider {
  async process(): Promise<FulfillmentResult> {
    return {
      success: false,
      retryable: false,
      code: "MANUAL_REQUIRED",
      message: "Для этого товара требуется ручная выдача",
    };
  }

  async retry(): Promise<FulfillmentResult> {
    return {
      success: false,
      retryable: false,
      code: "MANUAL_REQUIRED",
      message: "Ручная выдача ещё не завершена",
    };
  }

  async cancel(): Promise<void> {}
}

export class ExternalApiFulfillmentProvider implements FulfillmentProvider {
  async process(): Promise<FulfillmentResult> {
    return {
      success: false,
      retryable: true,
      code: "PROVIDER_NOT_CONFIGURED",
      message: "Внешний provider ещё не подключён",
    };
  }

  async retry(): Promise<FulfillmentResult> {
    return {
      success: false,
      retryable: true,
      code: "PROVIDER_NOT_CONFIGURED",
      message: "Повторная попытка невозможна без внешнего provider",
    };
  }

  async cancel(): Promise<void> {}
}
