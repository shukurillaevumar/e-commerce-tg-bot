PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  telegram_id INTEGER NOT NULL UNIQUE,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  is_bot INTEGER NOT NULL DEFAULT 0,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')) DEFAULT 'low',
  suspicious INTEGER NOT NULL DEFAULT 0,
  allowlisted INTEGER NOT NULL DEFAULT 0,
  denylisted INTEGER NOT NULL DEFAULT 0,
  referred_by_user_id TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  active_ticket_id TEXT,
  segment TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  telegram_id INTEGER NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'support')),
  permissions TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  availability_mode TEXT NOT NULL CHECK (availability_mode IN ('unlimited', 'soft_limit', 'hard_limit', 'manual')) DEFAULT 'unlimited',
  availability_limit INTEGER,
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_variants (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  package_size TEXT,
  tariff TEXT,
  offer_type TEXT,
  rub_price INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  fulfillment_strategy TEXT NOT NULL CHECK (fulfillment_strategy IN ('mock', 'manual', 'external_api', 'custom')),
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  rate_rub_per_star REAL NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual')) DEFAULT 'manual',
  comment TEXT,
  created_by_admin_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (created_by_admin_id) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_variant_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'invoice_sent', 'paid', 'processing', 'completed', 'failed', 'cancelled')),
  review_status TEXT NOT NULL CHECK (review_status IN ('none', 'required', 'in_review', 'approved', 'rejected')) DEFAULT 'none',
  cancellation_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  invoice_slug TEXT UNIQUE,
  invoice_message_id INTEGER,
  invoice_sent_at TEXT,
  invoice_expires_at TEXT,
  paid_at TEXT,
  processing_started_at TEXT,
  completed_at TEXT,
  failed_at TEXT,
  pricing_snapshot TEXT NOT NULL,
  campaign_source TEXT,
  referral_id TEXT,
  promo_code_id TEXT,
  requires_manual_review INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  telegram_payment_charge_id TEXT,
  telegram_invoice_payload TEXT NOT NULL UNIQUE,
  telegram_currency TEXT NOT NULL CHECK (telegram_currency = 'XTR') DEFAULT 'XTR',
  amount_xtr INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('created', 'pre_checkout_approved', 'succeeded', 'failed', 'refunded', 'cancelled')),
  provider_data TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  pricing_snapshot TEXT NOT NULL,
  failure_code TEXT,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  succeeded_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS promo_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('fixed_rub', 'percent', 'price_override')),
  value INTEGER NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  valid_from TEXT,
  valid_until TEXT,
  usage_limit_total INTEGER,
  usage_limit_per_user INTEGER,
  product_id TEXT,
  product_variant_id TEXT,
  allowed_segments TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (product_variant_id) REFERENCES product_variants(id)
);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id TEXT PRIMARY KEY,
  promo_code_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('applied', 'rejected')),
  rejection_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (promo_code_id) REFERENCES promo_codes(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL UNIQUE,
  start_parameter TEXT NOT NULL UNIQUE,
  first_order_id TEXT,
  reward_granted_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (referrer_user_id) REFERENCES users(id),
  FOREIGN KEY (referred_user_id) REFERENCES users(id),
  FOREIGN KEY (first_order_id) REFERENCES orders(id)
);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'waiting_user', 'resolved', 'closed')),
  subject TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('normal', 'high')) DEFAULT 'normal',
  assigned_admin_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (assigned_admin_id) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  author_type TEXT NOT NULL CHECK (author_type IN ('user', 'support', 'admin', 'owner')),
  author_user_id TEXT,
  message_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_admin_id TEXT,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (actor_admin_id) REFERENCES admins(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS fulfillment_jobs (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_variant_id TEXT NOT NULL,
  strategy TEXT NOT NULL CHECK (strategy IN ('mock', 'manual', 'external_api', 'custom')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'succeeded', 'retryable', 'manual_review', 'cancelled', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  priority TEXT NOT NULL CHECK (priority IN ('normal', 'high')) DEFAULT 'normal',
  scheduled_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_message TEXT,
  result_type TEXT,
  result_payload TEXT,
  result_masked_text TEXT,
  assigned_admin_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_variant_id) REFERENCES product_variants(id),
  FOREIGN KEY (assigned_admin_id) REFERENCES admins(id)
);

CREATE TABLE IF NOT EXISTS abuse_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('orders_rate_limit', 'failed_payments', 'promo_abuse', 'multiple_accounts_pattern', 'support_abuse', 'manual_flag', 'checkout_blocked')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  signal TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_by_admin_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (updated_by_admin_id) REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users (telegram_id);
CREATE INDEX IF NOT EXISTS idx_users_risk_level ON users (risk_level, suspicious);
CREATE INDEX IF NOT EXISTS idx_admins_role ON admins (role, is_active);
CREATE INDEX IF NOT EXISTS idx_products_active_sort ON products (is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_variants_product_active ON product_variants (product_id, is_active);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_expiry ON orders (status, invoice_expires_at);
CREATE INDEX IF NOT EXISTS idx_orders_manual_review ON orders (requires_manual_review, review_status, created_at);
CREATE INDEX IF NOT EXISTS idx_payments_order_status ON payments (order_id, status);
CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_redemptions_user_code ON promo_redemptions (user_id, promo_code_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_status ON support_tickets (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_created ON support_messages (ticket_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fulfillment_jobs_status_scheduled ON fulfillment_jobs (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_abuse_events_user_created ON abuse_events (user_id, created_at DESC);
