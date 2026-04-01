# Security Checklist

- Validate `X-Telegram-Bot-Api-Secret-Token` on every webhook request
- Never store critical business data in KV
- Keep pricing, orders, payments, audit and fraud events in D1
- Enforce strict order state transitions in service layer
- Deduplicate payment success updates with KV idempotency keys
- Store immutable pricing snapshot per order/payment
- Restrict admin access by Telegram ID through `admins` table
- Separate `owner`, `admin`, `support` roles and permissions
- Validate input with Zod before business processing
- Log admin actions, payment events, retries, repricing and fraud events
- Do not auto-refund after successful fulfillment
- Cancel expired invoices and never reuse them
- Keep manual review separate from automatic checkout flow
- Use different bot token, D1 and KV namespaces for staging and production
- Rotate bot secrets and owner/admin access if compromise is suspected
