# Deployment Guide

## 1. Install dependencies

```bash
npm install
```

## 2. Create Cloudflare resources

- 1 D1 database for `staging`
- 1 D1 database for `production`
- 1 KV namespace for `staging`
- 1 KV namespace for `production`

Update `wrangler.toml` with real IDs for each environment.

## 3. Configure secrets

Set these secrets for each environment:

```bash
wrangler secret put BOT_TOKEN
wrangler secret put BOT_WEBHOOK_SECRET
wrangler secret put BOT_OWNER_TELEGRAM_ID
```

Optional but recommended:

```bash
wrangler secret put BOT_ADMIN_GROUP_ID
wrangler secret put DEFAULT_EXCHANGE_RATE_RUB_PER_XTR
```

## 4. Apply migrations

```bash
npm run db:migrate:staging
npm run db:migrate:production
```

## 5. Deploy

```bash
npm run deploy:staging
npm run deploy:production
```

## 6. Post-deploy checks

- verify `/healthz`
- verify D1 migration version
- verify webhook path and secret token
- verify owner bootstrap record exists in `admins`
- verify current exchange rate exists before opening checkout
