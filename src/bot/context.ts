import type { Context } from "grammy";
import type { Admin } from "@domain/models";
import type { User } from "@domain/models";
import type { ServiceContainer } from "@services/container";

export type BotContext = Context & {
  services: ServiceContainer;
  appUser?: User;
  appAdmin?: Admin | null;
};
