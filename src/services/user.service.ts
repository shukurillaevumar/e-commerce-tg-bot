import type { User } from "@domain/models";
import type { ServiceDeps } from "@services/types";

export class UserService {
  constructor(private readonly deps: ServiceDeps) {}

  private createReferralCode(telegramId: number): string {
    return `ref_${telegramId.toString(36)}`;
  }

  async ensureUser(input: {
    telegramId: number;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    languageCode: string | null;
    isBot: boolean;
  }): Promise<User> {
    const now = this.deps.clock.now().toISOString();
    const user = await this.deps.repositories.users.createOrUpdateFromTelegramUser({
      ...input,
      referralCode: this.createReferralCode(input.telegramId),
      now,
    });

    return user;
  }
}
