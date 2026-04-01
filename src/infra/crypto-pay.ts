import { AppError } from "@domain/errors";

interface CryptoPayResponse<T> {
  ok: boolean;
  result?: T;
  error?: {
    code?: string;
    name?: string;
  };
}

export interface CryptoPayInvoice {
  invoice_id: number;
  status: string;
  bot_invoice_url?: string;
  mini_app_invoice_url?: string;
  web_app_invoice_url?: string;
  amount: string;
  fiat?: string;
  asset?: string;
  payload?: string;
  paid_asset?: string;
  paid_amount?: string;
}

export interface CryptoPayInvoicePaidUpdate {
  update_id: number;
  update_type: "invoice_paid";
  request_date: string;
  payload: CryptoPayInvoice;
}

export interface CryptoPayGateway {
  isEnabled(): boolean;
  createInvoice(input: {
    amountRub: number;
    description: string;
    payload: string;
    expiresInSeconds: number;
  }): Promise<CryptoPayInvoice>;
  verifyWebhookSignature(body: string, signature: string | null): Promise<boolean>;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(input: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
}

export class HttpCryptoPayGateway implements CryptoPayGateway {
  constructor(
    private readonly token?: string,
    private readonly baseUrl = "https://pay.crypt.bot/api",
    private readonly acceptedAssets?: string,
    private readonly swapTo?: string,
  ) {}

  isEnabled(): boolean {
    return Boolean(this.token);
  }

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    if (!this.token) {
      throw new AppError("CRYPTO_PAY_NOT_CONFIGURED", "Crypto Bot payment is not configured", 503);
    }

    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Crypto-Pay-API-Token": this.token,
      },
      body: JSON.stringify(body),
    });

    const data = (await response.json()) as CryptoPayResponse<T>;
    if (!response.ok || !data.ok || !data.result) {
      const code = data.error?.code ?? data.error?.name ?? "CRYPTO_PAY_API_ERROR";
      throw new AppError(code, "Crypto Bot API error", 502);
    }

    return data.result;
  }

  async createInvoice(input: {
    amountRub: number;
    description: string;
    payload: string;
    expiresInSeconds: number;
  }): Promise<CryptoPayInvoice> {
    const body: Record<string, unknown> = {
      currency_type: "fiat",
      fiat: "RUB",
      amount: input.amountRub.toFixed(2),
      description: input.description,
      payload: input.payload,
      expires_in: input.expiresInSeconds,
      allow_comments: false,
      allow_anonymous: true,
    };

    if (this.acceptedAssets?.trim()) {
      body.accepted_assets = this.acceptedAssets;
    }
    if (this.swapTo?.trim()) {
      body.swap_to = this.swapTo;
    }

    return this.call<CryptoPayInvoice>("createInvoice", body);
  }

  async verifyWebhookSignature(body: string, signature: string | null): Promise<boolean> {
    if (!this.token || !signature) {
      return false;
    }

    const secret = await sha256(this.token);
    const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const hmac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
    return hex(hmac) === signature.toLowerCase();
  }
}
