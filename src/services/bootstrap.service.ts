import { rolePermissionMap } from "@domain/permissions";
import type { ServiceDeps } from "@services/types";
import { AuditService } from "@services/audit.service";
import { SettingsService } from "@services/settings.service";
import { UserService } from "@services/user.service";

export class BootstrapService {
  private readonly userService: UserService;
  private readonly settingsService: SettingsService;
  private readonly auditService: AuditService;

  constructor(private readonly deps: ServiceDeps) {
    this.userService = new UserService(deps);
    this.settingsService = new SettingsService(deps);
    this.auditService = new AuditService(deps);
  }

  async bootstrap(): Promise<void> {
    await this.settingsService.bootstrapDefaults();

    const ownerTelegramId = Number(this.deps.env.BOT_OWNER_TELEGRAM_ID);
    const ownerUser = await this.userService.ensureUser({
      telegramId: ownerTelegramId,
      username: null,
      firstName: "Owner",
      lastName: null,
      languageCode: this.deps.env.DEFAULT_LANGUAGE ?? "ru",
      isBot: false,
    });

    await this.deps.repositories.admins.bootstrapOwner({
      userId: ownerUser.id,
      telegramId: ownerTelegramId,
      permissions: rolePermissionMap.owner,
      now: this.deps.clock.now().toISOString(),
    });

    const currentRate = await this.deps.repositories.exchangeRates.getCurrent();
    const configuredRate = Number(this.deps.env.DEFAULT_EXCHANGE_RATE_RUB_PER_XTR ?? "");
    if (!currentRate && Number.isFinite(configuredRate) && configuredRate > 0) {
      const admin = await this.deps.repositories.admins.findByTelegramId(ownerTelegramId);
      if (admin) {
        await this.deps.repositories.exchangeRates.create({
          version: 1,
          rateRubPerStar: configuredRate,
          comment: "Bootstrap initial rate",
          createdByAdminId: admin.id,
          now: this.deps.clock.now().toISOString(),
        });
      }
    }

    await this.auditService.log({
      actorAdminId: null,
      actorUserId: ownerUser.id,
      action: "bootstrap_owner",
      entityType: "admin",
      entityId: ownerUser.id,
      payload: {
        ownerTelegramId,
      },
    });
  }
}
