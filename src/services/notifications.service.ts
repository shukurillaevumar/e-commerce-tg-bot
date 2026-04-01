import { adminText, uiText } from "@domain/messages";
import type { Order, User } from "@domain/models";
import type { ServiceDeps } from "@services/types";

export class NotificationsService {
  constructor(private readonly deps: ServiceDeps) {}

  async notifyUserOrderCompleted(user: User, order: Order, deliveryText: string): Promise<void> {
    await this.deps.telegram.sendMessage(
      user.telegramId,
      `${uiText.orderCompleted}\n\nЗаказ: ${order.publicId}\n${deliveryText}`,
    );
  }

  async notifyUserOrderProcessing(user: User, order: Order): Promise<void> {
    await this.deps.telegram.sendMessage(
      user.telegramId,
      `${uiText.orderProcessing}\n\nЗаказ: ${order.publicId}`,
    );
  }

  async notifyUserPaymentFailed(user: User, order: Order): Promise<void> {
    await this.deps.telegram.sendMessage(
      user.telegramId,
      `${uiText.paymentFailed}\n\nЗаказ: ${order.publicId}`,
    );
  }

  async notifyAdmins(text: string): Promise<void> {
    const admins = await this.deps.repositories.admins.listActive?.();
    if (admins) {
      for (const admin of admins) {
        await this.deps.telegram.sendMessage(admin.telegramId, text).catch((error) => {
          this.deps.logger.warn("failed_to_notify_admin", { error: String(error), telegramId: admin.telegramId });
        });
      }
    }

    if (this.deps.env.BOT_ADMIN_GROUP_ID) {
      await this.deps.telegram.sendMessage(this.deps.env.BOT_ADMIN_GROUP_ID, text).catch((error) => {
        this.deps.logger.warn("failed_to_notify_admin_group", { error: String(error) });
      });
    }
  }

  async notifyManualReview(order: Order): Promise<void> {
    await this.notifyAdmins(`${adminText.manualReviewAlert}\n\nЗаказ: ${order.publicId}`);
  }

  async notifyFulfillmentFailure(order: Order): Promise<void> {
    await this.notifyAdmins(`${adminText.fulfillmentFailureAlert}\n\nЗаказ: ${order.publicId}`);
  }
}
