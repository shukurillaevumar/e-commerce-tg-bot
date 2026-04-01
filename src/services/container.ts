import type { Env } from "@infra/bindings";
import { CloudflareD1Runner } from "@infra/db";
import { CloudflareKvStore } from "@infra/kv";
import { createLogger } from "@infra/logger";
import { systemClock } from "@infra/time";
import { BotApiTelegramGateway } from "@infra/telegram";
import { AbuseEventsRepository } from "@repositories/abuse-events.repository";
import { AdminsRepository } from "@repositories/admins.repository";
import { AuditLogsRepository } from "@repositories/audit-logs.repository";
import { ExchangeRatesRepository } from "@repositories/exchange-rates.repository";
import { FulfillmentJobsRepository } from "@repositories/fulfillment-jobs.repository";
import { OrdersRepository } from "@repositories/orders.repository";
import { PaymentsRepository } from "@repositories/payments.repository";
import { ProductsRepository } from "@repositories/products.repository";
import { PromoCodesRepository } from "@repositories/promo-codes.repository";
import { ReferralsRepository } from "@repositories/referrals.repository";
import { SettingsRepository } from "@repositories/settings.repository";
import { SupportRepository } from "@repositories/support.repository";
import { UsersRepository } from "@repositories/users.repository";
import { AdminAuthService } from "@services/admin-auth.service";
import { AdminService } from "@services/admin.service";
import { BootstrapService } from "@services/bootstrap.service";
import { CatalogService } from "@services/catalog.service";
import { FulfillmentService } from "@services/fulfillment.service";
import { FraudService } from "@services/fraud.service";
import { IdempotencyService } from "@services/idempotency.service";
import { NotificationsService } from "@services/notifications.service";
import { OrderService } from "@services/order.service";
import { PaymentService } from "@services/payment.service";
import { PricingService } from "@services/pricing.service";
import { SettingsService } from "@services/settings.service";
import { SupportService } from "@services/support.service";
import { UserService } from "@services/user.service";
import type { Repositories, ServiceDeps } from "@services/types";

export interface ServiceContainer {
  deps: ServiceDeps;
  repositories: Repositories;
  userService: UserService;
  adminAuthService: AdminAuthService;
  adminService: AdminService;
  bootstrapService: BootstrapService;
  catalogService: CatalogService;
  pricingService: PricingService;
  orderService: OrderService;
  paymentService: PaymentService;
  fulfillmentService: FulfillmentService;
  fraudService: FraudService;
  notificationsService: NotificationsService;
  supportService: SupportService;
  settingsService: SettingsService;
  idempotencyService: IdempotencyService;
}

export function createServiceContainer(env: Env): ServiceContainer {
  const logger = createLogger({ env: env.APP_ENV });
  const db = new CloudflareD1Runner(env.BOT_DB);
  const kv = new CloudflareKvStore(env.APP_KV, logger);
  const telegram = new BotApiTelegramGateway(env.BOT_TOKEN);

  const repositories: Repositories = {
    users: new UsersRepository(db),
    admins: new AdminsRepository(db),
    products: new ProductsRepository(db),
    orders: new OrdersRepository(db),
    payments: new PaymentsRepository(db),
    promoCodes: new PromoCodesRepository(db),
    referrals: new ReferralsRepository(db),
    support: new SupportRepository(db),
    auditLogs: new AuditLogsRepository(db),
    exchangeRates: new ExchangeRatesRepository(db),
    fulfillmentJobs: new FulfillmentJobsRepository(db),
    abuseEvents: new AbuseEventsRepository(db),
    settings: new SettingsRepository(db),
  };

  const deps: ServiceDeps = {
    env,
    db,
    kv,
    logger,
    clock: systemClock,
    telegram,
    repositories,
  };

  return {
    deps,
    repositories,
    userService: new UserService(deps),
    adminAuthService: new AdminAuthService(deps),
    adminService: new AdminService(deps),
    bootstrapService: new BootstrapService(deps),
    catalogService: new CatalogService(deps),
    pricingService: new PricingService(deps),
    orderService: new OrderService(deps),
    paymentService: new PaymentService(deps),
    fulfillmentService: new FulfillmentService(deps),
    fraudService: new FraudService(deps),
    notificationsService: new NotificationsService(deps),
    supportService: new SupportService(deps),
    settingsService: new SettingsService(deps),
    idempotencyService: new IdempotencyService(deps),
  };
}
