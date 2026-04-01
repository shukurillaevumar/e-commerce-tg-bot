import type { User } from "@domain/models";
import type { ServiceDeps } from "@services/types";
import { vi } from "vitest";

export class InMemoryKvStore {
  private readonly store = new Map<string, string>();

  async get<T = string>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as T;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

export function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: "usr_1",
    telegramId: 123,
    username: "tester",
    firstName: "Test",
    lastName: null,
    languageCode: "ru",
    isBot: false,
    riskLevel: "low",
    suspicious: false,
    allowlisted: false,
    denylisted: false,
    referredByUserId: null,
    referralCode: "ref_test",
    activeTicketId: null,
    segment: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createServiceDeps(overrides: Partial<ServiceDeps> = {}): ServiceDeps {
  const now = new Date("2026-04-01T00:00:00.000Z");

  return {
    env: {
      APP_ENV: "development",
      BOT_TOKEN: "token",
      BOT_WEBHOOK_SECRET: "secret",
      BOT_WEBHOOK_PATH: "/webhook/telegram",
      BOT_USERNAME: "test_bot",
      BOT_OWNER_TELEGRAM_ID: "123",
      BOT_DB: {} as D1Database,
      APP_KV: {} as KVNamespace,
    },
    db: {
      first: vi.fn(),
      all: vi.fn(),
      run: vi.fn(),
      batch: vi.fn(),
    },
    kv: new InMemoryKvStore() as unknown as ServiceDeps["kv"],
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
    clock: {
      now: () => now,
    },
    telegram: {
      sendMessage: vi.fn(async () => undefined),
      sendInvoice: vi.fn(async () => ({ message_id: 1 })),
      answerPreCheckoutQuery: vi.fn(async () => undefined),
    },
    repositories: {
      users: {
        updateRiskState: vi.fn(),
        findById: vi.fn(),
      },
      admins: {
        listActive: vi.fn(async () => []),
      },
      products: {
        findVariantById: vi.fn(),
      },
      orders: {
        findById: vi.fn(),
        markPaid: vi.fn(),
        markProcessing: vi.fn(),
      },
      payments: {
        findByInvoicePayload: vi.fn(),
        markSucceeded: vi.fn(),
        markFailed: vi.fn(),
      },
      promoCodes: {} as never,
      referrals: {} as never,
      support: {} as never,
      auditLogs: {} as never,
      exchangeRates: {} as never,
      fulfillmentJobs: {
        findByOrderId: vi.fn(async () => null),
        create: vi.fn(),
      },
      abuseEvents: {
        create: vi.fn(),
      },
      settings: {
        get: vi.fn(async () => null),
        upsert: vi.fn(),
      },
    } as unknown as ServiceDeps["repositories"],
    ...overrides,
  };
}
