import { AuthorizationError } from "@domain/errors";
import { hasPermission } from "@domain/permissions";
import type { Admin } from "@domain/models";
import type { ServiceDeps } from "@services/types";

export class AdminAuthService {
  constructor(private readonly deps: ServiceDeps) {}

  async getAdminByTelegramId(telegramId: number): Promise<Admin | null> {
    return this.deps.repositories.admins.findByTelegramId(telegramId);
  }

  async requirePermission(telegramId: number, permission: string): Promise<Admin> {
    const admin = await this.getAdminByTelegramId(telegramId);
    if (!admin || !hasPermission(admin.role, admin.permissions, permission)) {
      throw new AuthorizationError();
    }
    return admin;
  }
}
