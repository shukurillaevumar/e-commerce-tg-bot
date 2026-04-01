# Architecture

## Layering

- `src/bot`: Telegram-specific entrypoints, commands, callback handlers, keyboards and webhook composition
- `src/services`: use-cases and business orchestration
- `src/repositories`: D1 persistence with explicit SQL and row mapping
- `src/domain`: enums, models, validation, pricing, state machine and UX copy
- `src/infra`: Cloudflare and Telegram adapters, logging, time and transport helpers
- `src/utils`: stateless shared helpers

## Core Business Rules

- Product price is defined in `RUB`
- Checkout price is converted to `XTR` using `ceil(rub_price / rate)`
- Exchange rate is versioned in `exchange_rates`
- Order status machine is strict:
  - `created -> invoice_sent`
  - `invoice_sent -> paid`
  - `paid -> processing`
  - `processing -> completed | failed`
  - cancellation is allowed only before fulfillment starts and is stored as terminal `cancelled` with a separate reason
- Manual review is modelled separately via `review_status` and `requires_manual_review`, so the core order lifecycle remains clean

## Payment Safety

- Every Telegram payment success update must be deduplicated with KV key `payment_update:<update_id>`
- Critical business state stays in D1
- Payment snapshot stores:
  - base/final RUB
  - exchange rate version/value
  - final XTR
  - discount source/type/value
  - promo/referral flags
  - pricing rule version

## Fulfillment Model

- `FulfillmentProvider` is pluggable
- v1 providers:
  - `mock`
  - `manual`
  - `external_api` placeholder
- Retry policy:
  - up to 3 attempts
  - then move job to `manual_review`
  - notify admins

## Fraud Model

- Fast counters live in KV
- Long-term audit trail lives in D1 via `abuse_events`
- Risk levels:
  - `low`
  - `medium`
  - `high`
- High-risk users do not receive invoice creation and are diverted to manual review

## Runtime

- Worker `fetch` handles healthcheck and Telegram webhook
- Worker `scheduled` handles:
  - invoice expiry
  - fulfillment retries
  - manual queue reminders extension point
