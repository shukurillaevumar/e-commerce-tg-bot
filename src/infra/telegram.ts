import { AppError } from "@domain/errors";

interface TelegramApiResult<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export interface TelegramInvoicePrice {
  label: string;
  amount: number;
}

export interface TelegramGateway {
  sendMessage(chatId: number | string, text: string, extra?: Record<string, unknown>): Promise<void>;
  sendInvoice(input: {
    chatId: number | string;
    title: string;
    description: string;
    payload: string;
    startParameter: string;
    prices: TelegramInvoicePrice[];
    photoUrl?: string;
  }): Promise<{ message_id?: number }>;
  answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string): Promise<void>;
}

export class BotApiTelegramGateway implements TelegramGateway {
  constructor(private readonly botToken: string) {}

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.botToken}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as TelegramApiResult<T>;
    if (!response.ok || !data.ok || !data.result) {
      throw new AppError("TELEGRAM_API_ERROR", data.description ?? "Telegram API error", 502);
    }

    return data.result;
  }

  async sendMessage(chatId: number | string, text: string, extra?: Record<string, unknown>): Promise<void> {
    await this.call("sendMessage", {
      chat_id: chatId,
      text,
      ...extra,
    });
  }

  async sendInvoice(input: {
    chatId: number | string;
    title: string;
    description: string;
    payload: string;
    startParameter: string;
    prices: TelegramInvoicePrice[];
    photoUrl?: string;
  }): Promise<{ message_id?: number }> {
    return this.call("sendInvoice", {
      chat_id: input.chatId,
      title: input.title,
      description: input.description,
      payload: input.payload,
      currency: "XTR",
      prices: input.prices,
      start_parameter: input.startParameter,
      photo_url: input.photoUrl,
    });
  }

  async answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string): Promise<void> {
    await this.call("answerPreCheckoutQuery", {
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      error_message: errorMessage,
    });
  }
}
