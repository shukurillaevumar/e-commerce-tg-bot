import type { User } from "@domain/models";
import type { Env } from "@infra/bindings";
import type { D1Runner } from "@infra/db";
import type { KvStore } from "@infra/kv";
import type { Logger } from "@infra/logger";
import type { Clock } from "@infra/time";
import type { TelegramGateway } from "@infra/telegram";
import type { AbuseEventsRepository } from "@repositories/abuse-events.repository";
import type { AdminsRepository } from "@repositories/admins.repository";
import type { AuditLogsRepository } from "@repositories/audit-logs.repository";
import type { ExchangeRatesRepository } from "@repositories/exchange-rates.repository";
import type { FulfillmentJobsRepository } from "@repositories/fulfillment-jobs.repository";
import type { OrdersRepository } from "@repositories/orders.repository";
import type { PaymentsRepository } from "@repositories/payments.repository";
import type { ProductsRepository } from "@repositories/products.repository";
import type { PromoCodesRepository } from "@repositories/promo-codes.repository";
import type { ReferralsRepository } from "@repositories/referrals.repository";
import type { SettingsRepository } from "@repositories/settings.repository";
import type { SupportRepository } from "@repositories/support.repository";
import type { UsersRepository } from "@repositories/users.repository";

export interface Repositories {
  users: UsersRepository;
  admins: AdminsRepository;
  products: ProductsRepository;
  orders: OrdersRepository;
  payments: PaymentsRepository;
  promoCodes: PromoCodesRepository;
  referrals: ReferralsRepository;
  support: SupportRepository;
  auditLogs: AuditLogsRepository;
  exchangeRates: ExchangeRatesRepository;
  fulfillmentJobs: FulfillmentJobsRepository;
  abuseEvents: AbuseEventsRepository;
  settings: SettingsRepository;
}

export interface ServiceDeps {
  env: Env;
  db: D1Runner;
  kv: KvStore;
  logger: Logger;
  clock: Clock;
  telegram: TelegramGateway;
  repositories: Repositories;
}

export interface AuthenticatedAdminContext {
  user: User;
  adminId: string;
  telegramId: number;
}
