import { ConflictError, NotFoundError } from "@domain/errors";
import { assertValidOrderTransition } from "@domain/state-machine";
import { addMinutes } from "@infra/time";
import type { Order } from "@domain/models";
import type { ServiceDeps } from "@services/types";
import {
  ExternalApiFulfillmentProvider,
  ManualFulfillmentProvider,
  MockFulfillmentProvider,
  type FulfillmentProvider,
} from "@services/fulfillment.providers";
import { NotificationsService } from "@services/notifications.service";

export class FulfillmentService {
  private readonly notificationsService: NotificationsService;
  private readonly providers: Record<string, FulfillmentProvider>;

  constructor(private readonly deps: ServiceDeps) {
    this.notificationsService = new NotificationsService(deps);
    this.providers = {
      mock: new MockFulfillmentProvider(),
      manual: new ManualFulfillmentProvider(),
      external_api: new ExternalApiFulfillmentProvider(),
      custom: new ManualFulfillmentProvider(),
    };
  }

  async enqueue(order: Order, priority: "normal" | "high" = "normal"): Promise<void> {
    const variant = await this.deps.repositories.products.findVariantById(order.productVariantId);
    if (!variant) {
      throw new NotFoundError("Товарный вариант для выдачи не найден");
    }

    const now = this.deps.clock.now().toISOString();
    const existing = await this.deps.repositories.fulfillmentJobs.findByOrderId(order.id);
    if (existing && ["pending", "processing", "retryable", "manual_review", "succeeded"].includes(existing.status)) {
      return;
    }

    await this.deps.repositories.fulfillmentJobs.create({
      orderId: order.id,
      productVariantId: order.productVariantId,
      strategy: variant.fulfillmentStrategy,
      priority,
      scheduledAt: now,
      now,
    });
  }

  async processRunnableJobs(): Promise<void> {
    const now = this.deps.clock.now().toISOString();
    const jobs = await this.deps.repositories.fulfillmentJobs.listRunnable(now);

    for (const job of jobs) {
      try {
        const order = await this.deps.repositories.orders.findById(job.orderId);
        if (!order) {
          continue;
        }

        const user = await this.deps.repositories.users.findById(order.userId);
        const variant = await this.deps.repositories.products.findVariantById(job.productVariantId);
        if (!user || !variant) {
          continue;
        }

        if (order.status === "completed") {
          await this.deps.repositories.fulfillmentJobs.updateStatus(job.id, "succeeded", now);
          continue;
        }

        if (order.status !== "processing") {
          throw new ConflictError("Обработка выдачи возможна только для заказа в статусе processing");
        }

        const provider: FulfillmentProvider =
          this.providers[variant.fulfillmentStrategy] ?? this.providers.manual ?? new ManualFulfillmentProvider();
        const nextAttempt = job.attempt + 1;
        await this.deps.repositories.fulfillmentJobs.markProcessing(job.id, nextAttempt, now);

        const result =
          job.attempt > 0
            ? await provider.retry({ job, order, user, variant })
            : await provider.process({ job, order, user, variant });

        if (result.success) {
          assertValidOrderTransition(order.status, "completed");
          await this.deps.repositories.fulfillmentJobs.markSucceeded(
            job.id,
            result.resultType,
            result.payload,
            result.maskedText,
            now,
          );
          await this.deps.repositories.orders.markCompleted(order.id, now);
          await this.notificationsService.notifyUserOrderCompleted(
            user,
            order,
            result.maskedText ?? "Результат выдачи зафиксирован в системе.",
          );
          continue;
        }

        if (result.retryable && nextAttempt < job.maxAttempts) {
          const scheduledAt = addMinutes(this.deps.clock.now(), 5).toISOString();
          await this.deps.repositories.fulfillmentJobs.markRetryable(job.id, result.code, result.message, scheduledAt, now);
          continue;
        }

        await this.deps.repositories.fulfillmentJobs.markManualReview(job.id, result.code, result.message, now);
        await this.deps.repositories.orders.setReviewStatus(order.id, "required", true, now);
        await this.notificationsService.notifyFulfillmentFailure(order);
      } catch (error) {
        this.deps.logger.error("fulfillment_job_failed", { error: String(error), jobId: job.id });
      }
    }
  }
}
