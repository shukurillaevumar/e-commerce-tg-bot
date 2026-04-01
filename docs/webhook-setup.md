# Webhook Setup

## Worker Route

Webhook endpoint:

```text
https://<your-worker-domain>/webhook/telegram
```

This must match `BOT_WEBHOOK_PATH`.

## Secret Token

Use a random high-entropy value in `BOT_WEBHOOK_SECRET`. The worker validates `X-Telegram-Bot-Api-Secret-Token` before processing the update.

## Telegram Webhook Command

Example:

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://<your-worker-domain>/webhook/telegram",
    "secret_token": "<YOUR_SECRET_TOKEN>",
    "allowed_updates": ["message", "callback_query", "pre_checkout_query"]
  }'
```

## Verification

After setup:

- send `/start`
- open catalog
- generate an invoice
- verify pre-checkout and successful payment updates reach the worker
